// Cinemail QR encoder - byte mode, error-correction level M, versions 1 to 10.
//
// Here because the invite panel used to build an <img src> pointing at
// api.qrserver.com, and the thing it encoded was
//
//     https://cinemail.app/?friend=<the user's own UUID>
//
// so every time somebody opened that panel their Cinemail id and their IP address went
// to a third party nobody had been told about. PrivacyInfo.xcprivacy declares no
// tracking and no third-party sharing; while that request existed the declaration was
// simply untrue. It also meant no QR at all without a network, on a screen that
// otherwise works offline.
//
// Ten versions is far more than the invite link needs (version 10 at level M holds 213
// bytes; the link is about 60), and level M survives a phone camera at an angle.
//
// Verified by round-trip: every code this produces is decoded again by jsQR and the
// string compared, across lengths from 1 to 213 bytes. See qr-test.mjs.

// ver: [ecCodewordsPerBlock, [[blockCount, dataCodewordsPerBlock], ...]]
const _QR_EC_TABLES = {
  // Level M - about 15% recoverable. Used when nothing covers the code.
  M: {
    1:  [10, [[1, 16]]],
    2:  [16, [[1, 28]]],
    3:  [26, [[1, 44]]],
    4:  [18, [[2, 32]]],
    5:  [24, [[2, 43]]],
    6:  [16, [[4, 27]]],
    7:  [18, [[4, 31]]],
    8:  [22, [[2, 38], [2, 39]]],
    9:  [22, [[3, 36], [2, 37]]],
    10: [26, [[4, 43], [1, 44]]],
  },
  // Level H - about 30% recoverable. The price of putting the logo in the middle: the
  // modules underneath it are simply lost, and only the error correction brings them
  // back. Capacity drops (version 10 holds 122 bytes rather than 213), which is still
  // far more than an invite link needs.
  H: {
    1:  [17, [[1, 9]]],
    2:  [28, [[1, 16]]],
    3:  [22, [[2, 13]]],
    4:  [16, [[4, 9]]],
    5:  [22, [[2, 11], [2, 12]]],
    6:  [28, [[4, 15]]],
    7:  [26, [[4, 13], [1, 14]]],
    8:  [26, [[4, 14], [2, 15]]],
    9:  [24, [[4, 12], [4, 13]]],
    10: [28, [[6, 15], [2, 16]]],
  },
};

// Format-information bits per level, as the standard numbers them.
const _QR_LEVEL_BITS = { M: 0b00, H: 0b10 };

const _QR_ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

// Version information, 18 bits, only written from version 7 up.
const _QR_VERINFO = { 7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3 };

// ── GF(256) for Reed-Solomon, generator 2, primitive polynomial 0x11D ─────────
const _GF_EXP = new Uint8Array(512), _GF_LOG = new Uint8Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    _GF_EXP[i] = x; _GF_LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i++) _GF_EXP[i] = _GF_EXP[i - 255];
})();
function _gfMul(a, b) { return (a === 0 || b === 0) ? 0 : _GF_EXP[_GF_LOG[a] + _GF_LOG[b]]; }

// Generator polynomial for `degree` error-correction codewords.
function _rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= _gfMul(poly[j], _GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function _rsEncode(data, ecLen) {
  const gen = _rsGenerator(ecLen);
  const res = new Array(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.shift(); res.push(0);
    for (let i = 0; i < ecLen; i++) res[i] ^= _gfMul(gen[i + 1], factor);
  }
  return res;
}

// ── Bit stream ───────────────────────────────────────────────────────────────
function _bits() {
  const out = [];
  return {
    push(value, len) { for (let i = len - 1; i >= 0; i--) out.push((value >> i) & 1); },
    get length() { return out.length; },
    bytes() {
      while (out.length % 8) out.push(0);
      const b = [];
      for (let i = 0; i < out.length; i += 8) {
        let v = 0;
        for (let j = 0; j < 8; j++) v = (v << 1) | out[i + j];
        b.push(v);
      }
      return b;
    },
  };
}

function _utf8(str) {
  const out = [];
  for (const ch of unescape(encodeURIComponent(str))) out.push(ch.charCodeAt(0));
  return out;
}

// ── Matrix construction ──────────────────────────────────────────────────────
function _newMatrix(size) {
  const m = [], reserved = [];
  for (let i = 0; i < size; i++) { m.push(new Array(size).fill(0)); reserved.push(new Array(size).fill(false)); }
  return { m, reserved, size };
}

function _placeFinder(g, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r, cc = col + c;
      if (rr < 0 || rr >= g.size || cc < 0 || cc >= g.size) continue;
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                     (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      g.m[rr][cc] = (inRing || inCore) ? 1 : 0;
      g.reserved[rr][cc] = true;
    }
  }
}

function _buildFunctionPatterns(g, version) {
  const size = g.size;
  _placeFinder(g, 0, 0);
  _placeFinder(g, 0, size - 7);
  _placeFinder(g, size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const bit = i % 2 === 0 ? 1 : 0;
    g.m[6][i] = bit; g.reserved[6][i] = true;
    g.m[i][6] = bit; g.reserved[i][6] = true;
  }

  // Alignment patterns, skipping the three finder corners
  const centres = _QR_ALIGN[version];
  for (const r of centres) {
    for (const c of centres) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          g.m[r + dr][c + dc] = on ? 1 : 0;
          g.reserved[r + dr][c + dc] = true;
        }
      }
    }
  }

  // Format-information areas. The dark module at (size-8, 8) is NOT set here: it sits
  // inside the second format copy and would be overwritten by it, so _writeFormat puts
  // it back at the end.
  g.reserved[size - 8][8] = true;
  for (let i = 0; i < 9; i++) {
    if (!g.reserved[8][i]) { g.reserved[8][i] = true; }
    if (!g.reserved[i][8]) { g.reserved[i][8] = true; }
  }
  for (let i = 0; i < 8; i++) {
    g.reserved[8][size - 1 - i] = true;
    g.reserved[size - 1 - i][8] = true;
  }

  // Version information block, version 7 and up
  if (version >= 7) {
    const info = _QR_VERINFO[version];
    for (let i = 0; i < 18; i++) {
      const bit = (info >> i) & 1;
      const r = Math.floor(i / 3), c = i % 3;
      g.m[r][size - 11 + c] = bit; g.reserved[r][size - 11 + c] = true;
      g.m[size - 11 + c][r] = bit; g.reserved[size - 11 + c][r] = true;
    }
  }
}

function _placeData(g, codewords) {
  const size = g.size;
  let bitIndex = 0;
  const nextBit = () => {
    const byte = codewords[bitIndex >> 3];
    const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
    bitIndex++;
    return bit;
  };
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;            // the vertical timing pattern is skipped entirely
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (!g.reserved[row][c]) g.m[row][c] = nextBit();
      }
    }
    upward = !upward;
  }
}

function _maskFn(id) {
  return [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ][id];
}

// Format information: 5 data bits (EC level + mask) expanded by BCH(15,5), then XORed
// with 0x5412 so an all-zero format still has dark modules.
function _formatBits(maskId, level) {
  const ecBits = _QR_LEVEL_BITS[level];
  let data = (ecBits << 3) | maskId;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >> 9) & 1) * 0x537);
  return (((data << 10) | rem) ^ 0x5412) & 0x7FFF;
}

function _writeFormat(g, maskId, level) {
  const size = g.size, bits = _formatBits(maskId, level);
  for (let i = 0; i < 15; i++) {
    // Most significant bit first: position i takes bit 14-i. Writing it the other way
    // round produced a code whose data modules were byte-for-byte correct and which no
    // decoder could read - the 13 modules that differed from a reference implementation
    // were all format information.
    const bit = (bits >> (14 - i)) & 1;
    // Copy one: around the top-left finder
    if (i < 6)       g.m[8][i] = bit;
    else if (i === 6) g.m[8][7] = bit;
    else if (i === 7) g.m[8][8] = bit;
    else if (i === 8) g.m[7][8] = bit;
    else              g.m[14 - i][8] = bit;
    // Copy two: split between the other two finders
    if (i < 8) g.m[size - 1 - i][8] = bit;
    else       g.m[8][size - 15 + i] = bit;
  }
  g.m[size - 8][8] = 1;   // the dark module, restored after copy two wrote over it
}

function _penalty(m) {
  const n = m.length;
  let score = 0;

  // Rule 1: runs of five or more of the same colour, in both directions
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      let run = 1;
      for (let j = 1; j < n; j++) {
        const cur  = pass ? m[j][i]     : m[i][j];
        const prev = pass ? m[j - 1][i] : m[i][j - 1];
        if (cur === prev) { run++; if (run === 5) score += 3; else if (run > 5) score += 1; }
        else run = 1;
      }
    }
  }

  // Rule 2: every 2x2 block of one colour
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }

  // Rule 3: finder-like 1:1:3:1:1 patterns with four light modules on one side
  const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const matches = (get, i) => {
    let a = true, b = true;
    for (let k = 0; k < 11; k++) {
      const v = get(i + k);
      if (v !== A[k]) a = false;
      if (v !== B[k]) b = false;
    }
    return a || b;
  };
  for (let r = 0; r < n; r++)
    for (let c = 0; c + 11 <= n; c++) {
      if (matches(k => m[r][k], c)) score += 40;
      if (matches(k => m[k][r], c)) score += 40;
    }

  // Rule 4: deviation from an even split of dark and light
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark += m[r][c];
  const pct = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

// Returns a size x size array of 0/1, or null if the text does not fit in version 10.
function qrMatrix(text, level = 'H') {
  const data = _utf8(text);
  const table = _QR_EC_TABLES[level] || _QR_EC_TABLES.H;

  let version = 0, layout = null, ecLen = 0, dataCapacity = 0;
  for (let v = 1; v <= 10; v++) {
    const [ec, blocks] = table[v];
    const cap = blocks.reduce((s, [count, len]) => s + count * len, 0);
    const countBits = v <= 9 ? 8 : 16;
    if (4 + countBits + data.length * 8 <= cap * 8) {
      version = v; layout = blocks; ecLen = ec; dataCapacity = cap; break;
    }
  }
  if (!version) return null;

  // Data codewords: mode, length, payload, terminator, pad
  const bs = _bits();
  bs.push(0b0100, 4);
  bs.push(data.length, version <= 9 ? 8 : 16);
  for (const b of data) bs.push(b, 8);
  const room = dataCapacity * 8 - bs.length;
  bs.push(0, Math.min(4, room));
  let bytes = bs.bytes();
  for (let i = 0; bytes.length < dataCapacity; i++) bytes.push(i % 2 === 0 ? 0xEC : 0x11);

  // Split into blocks, compute EC for each, then interleave both sets
  const dataBlocks = [], ecBlocks = [];
  let offset = 0;
  for (const [count, len] of layout) {
    for (let i = 0; i < count; i++) {
      const block = bytes.slice(offset, offset + len);
      offset += len;
      dataBlocks.push(block);
      ecBlocks.push(_rsEncode(block, ecLen));
    }
  }
  const interleaved = [];
  const maxData = Math.max(...dataBlocks.map(b => b.length));
  for (let i = 0; i < maxData; i++)
    for (const b of dataBlocks) if (i < b.length) interleaved.push(b[i]);
  for (let i = 0; i < ecLen; i++)
    for (const b of ecBlocks) interleaved.push(b[i]);

  const size = 17 + version * 4;
  const g = _newMatrix(size);
  _buildFunctionPatterns(g, version);
  _placeData(g, interleaved);

  // Try all eight masks, keep the least penalised
  let best = null, bestScore = Infinity;
  for (let maskId = 0; maskId < 8; maskId++) {
    const fn = _maskFn(maskId);
    const cand = g.m.map(row => row.slice());
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!g.reserved[r][c] && fn(r, c)) cand[r][c] ^= 1;
    const trial = { m: cand, size };
    _writeFormat(trial, maskId, level);
    const s = _penalty(cand);
    if (s < bestScore) { bestScore = s; best = cand; }
  }
  return best;
}

// An SVG data URI, drawn with one path so it stays sharp at any size and needs no
// network. Same colours the hosted image was asked for, so the card looks unchanged.
function qrDataURI(text, { size = 150, dark = '#ffffff', light = '#0d0d1a', margin = 4, level = 'H' } = {}) {
  const m = qrMatrix(text, level);
  if (!m) return '';
  const n = m.length, total = n + margin * 2;
  let path = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (m[r][c]) path += `M${c + margin} ${r + margin}h1v1h-1z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
              `<rect width="${total}" height="${total}" fill="${light}"/>` +
              `<path d="${path}" fill="${dark}"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { qrMatrix, qrDataURI };
