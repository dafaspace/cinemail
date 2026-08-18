// Cinemail avatar glyphs - pencil drawings, one 864x1584 sprite (avatars.webp).
//
// The ink lives in the sprite's ALPHA channel, so the app paints one of the eight
// palette colours behind it in CSS. That is why there is one sheet and not eight
// tinted copies of all 62 drawings.
//
// Order is row-major, six per row, and must match the sheet exactly - a wrong index
// silently shows the neighbouring character rather than failing, so ORDER below is the
// single source of truth for both the picker and the avatar.
const AVATAR_SPRITE = "./avatars.webp";
const AVATAR_COLS = 6;
// Grouped, not arbitrary: the picker is 62 circles now, and it reads as sections -
// animals, then creatures, then monsters, then magic folk, then people, then the
// cinema objects. Every pair sits side by side: wizard/witch, vampire/vampiress,
// elf/elfm, mermaid/merman, genie/genief, cowboy/cowgirl.
const AVATAR_ORDER = [
  "fox", "raccoon", "wolf", "dog", "lion", "tiger",
  "cat", "rabbit", "hedgehog", "horse", "panda", "gorilla",
  "owl", "frog", "turtle", "butterfly", "spider", "snake",
  "octopus", "shark", "trex", "dragon", "unicorn", "mushroom",
  "cactus", "ghost", "skull", "zombie", "troll", "clown",
  "alien", "wizard", "witch", "witchyoung", "vampire", "vampiress",
  "bat", "fairy", "elf", "elfm", "mermaid", "merman",
  "genie", "genief", "princess", "king", "dancer", "disguise",
  "detective", "cowboy", "cowgirl", "ninja", "robot", "astronaut",
  "rocket", "ufo", "clapper", "camera", "popcorn", "music",
  "bowler", "pumpkin",
];
const AVATAR_ROWS = Math.ceil(AVATAR_ORDER.length / AVATAR_COLS);

// Legacy only. Profiles saved before the switch store an emoji character, so each of
// the 36 drawings that existed then keeps resolving to itself.
//
// The 26 drawings added afterwards are deliberately absent: they were never selectable
// as emoji, so nothing can have them stored, and two of them - the young witch and the
// cowgirl - have no standard emoji at all. Inventing keys for them would put entries
// here that no stored value can ever match.
//
// The superhero, the villain and the singer are absent on purpose. Their drawings were
// Superman, a figure in the same S-shield and a performer at a mic; the first two are
// DC trademarks and were dropped. Pointing those characters at a ninja, a vampire and a
// music stave would have been an invented correspondence, not a real one - it would
// silently hand someone an avatar they never chose. Absent, they fall back to the
// initial, which is honest and one tap from being fixed.
const AVATAR_FROM_EMOJI = {
  "\u{1F98A}": "fox",       "\u{1F99D}": "raccoon",  "\u{1F409}": "dragon",
  "\u{1F981}": "lion",      "\u{1F42F}": "tiger",    "\u{1F43A}": "wolf",
  // The cat is now the sheet-7 drawing, the only one kept; an old profile holding
  // the cat emoji still lands on a cat, just a different one of them.
  "\u{1F431}": "cat",       "\u{1F430}": "rabbit",   "\u{1F989}": "owl",
  "\u{1F438}": "frog",      "\u{1F43C}": "panda",    "\u{1F984}": "unicorn",
  "\u{1F98B}": "butterfly", "\u{1F419}": "octopus",  "\u{1F47B}": "ghost",
  "\u{1F9D9}": "wizard",    "\u{1F9DB}": "vampire",  "\u{1F9DA}": "fairy",
  "\u{1F344}": "mushroom",  "\u{1F422}": "turtle",   "\u{1F3AC}": "clapper",
  "\u{1F3B5}": "music",     "\u{1F920}": "cowboy",   "\u{1F9DC}": "mermaid",
  "\u{1F916}": "robot",     "\u{1F47D}": "alien",    "\u{1F9DF}": "zombie",
  "\u{1F977}": "ninja",     "\u{1F996}": "trex",     "\u{1F9DE}": "genie",
  "\u{1F994}": "hedgehog",  "\u{1F978}": "disguise", "\u{1F478}": "princess",
  "\u{1F9DD}": "elf",       "\u{1F483}": "dancer",   "\u{1FAC5}": "king",
};

function avatarKey(v) {
  if (!v) return "";
  if (AVATAR_ORDER.indexOf(v) !== -1) return v;
  return AVATAR_FROM_EMOJI[v] || "";
}

// Background-size is a percentage of the element, so a 6-column sheet is 600%, and each
// step is 100/(cols-1) percent - not 100/cols, which is the mistake that leaves the
// first cell right and shifts every other one.
function avatarSpriteStyle(key) {
  const i = AVATAR_ORDER.indexOf(key);
  if (i < 0) return "";
  const c = i % AVATAR_COLS, r = Math.floor(i / AVATAR_COLS);
  const x = AVATAR_COLS > 1 ? (c * 100) / (AVATAR_COLS - 1) : 0;
  const y = AVATAR_ROWS > 1 ? (r * 100) / (AVATAR_ROWS - 1) : 0;
  return `background-image:url(${AVATAR_SPRITE});` +
         `background-size:${AVATAR_COLS * 100}% ${AVATAR_ROWS * 100}%;` +
         `background-position:${x.toFixed(4)}% ${y.toFixed(4)}%;` +
         `background-repeat:no-repeat;`;
}
