/**
 * XP Level system.
 * Resets monthly — these thresholds are for monthly XP.
 * Levels: Fresh Sprout → Legendary Farmer
 * emoji field = filename in dashboard/stardew_icons/ (used by UI as <img>)
 */

const LEVELS = [
  { name: 'Fresh Sprout',       minXP: 0,    emoji: 'Mixed_Seeds.png' },
  { name: 'New to the Farm',    minXP: 50,   emoji: 'Steel_Watering_Can.png' },
  { name: 'Learning the Land',  minXP: 125,  emoji: 'Gold_Hoe.png' },
  { name: 'Tending the Plot',   minXP: 250,  emoji: 'Corn.png' },
  { name: 'Full-Time Farmer',   minXP: 400,  emoji: 'Scarecrow.png' },
  { name: 'Harvest Ready',      minXP: 600,  emoji: 'Wheat.png' },
  { name: 'Keeper of the Farm', minXP: 850,  emoji: 'House.png' },
  { name: 'Master of the Land', minXP: 1150, emoji: 'Gold_Pickaxe.png' },
  { name: 'Legendary Farmer',   minXP: 1500, emoji: 'Iridium_Scythe.png' },
];

export function getLevel(monthXP) {
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (monthXP >= level.minXP) current = level;
    else break;
  }
  return current.name;
}

export function getLevelEmoji(_levelName) {
  return '🌾'; // Icons are image files (stardew_icons/) used by the dashboard UI only
}

export function getLevelIndex(monthXP) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (monthXP >= LEVELS[i].minXP) idx = i;
    else break;
  }
  return idx;
}

export function xpToNextLevel(monthXP) {
  for (const level of LEVELS) {
    if (monthXP < level.minXP) return level.minXP - monthXP;
  }
  return 0; // Legend
}

export function getAllLevels() {
  return LEVELS;
}

export function getLevelForXP(xp) {
  return LEVELS.reduce((best, level) => xp >= level.minXP ? level : best, LEVELS[0]);
}
