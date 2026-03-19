/**
 * XP Level system.
 * Resets monthly — these thresholds are for monthly XP.
 * Levels: Messy Guest → Domestic God
 */

const LEVELS = [
  { name: 'Messy Guest',     minXP: 0,    emoji: '🧦' },
  { name: 'Roommate',        minXP: 50,   emoji: '🛋️' },
  { name: 'Tenant',          minXP: 125,  emoji: '🔑' },
  { name: 'Homeowner',       minXP: 250,  emoji: '🏠' },
  { name: 'Neat Freak',      minXP: 400,  emoji: '✨' },
  { name: 'House Manager',   minXP: 600,  emoji: '📋' },
  { name: 'Home Chef',       minXP: 850,  emoji: '👨‍🍳' },
  { name: 'Estate Lord',     minXP: 1150, emoji: '🏡' },
  { name: 'Household CEO',   minXP: 1500, emoji: '👑' },
];

export function getLevel(monthXP) {
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (monthXP >= level.minXP) current = level;
    else break;
  }
  return current.name;
}

export function getLevelEmoji(levelName) {
  return LEVELS.find(l => l.name === levelName)?.emoji || '🌱';
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
