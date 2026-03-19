/**
 * Chore Tracker - Cloudflare Worker
 * Handles incoming Twilio SMS webhooks, fuzzy-matches chores,
 * logs to Google Sheets, and replies with XP/rank updates.
 */

import { fuzzyMatch } from './fuzzy.js';
import { getGoogleToken, appendChoreLog, getStats, getDailyXP, getRecentLog } from './sheets.js';
import { twimlResponse } from './twilio.js';
import { getLevel, getLevelEmoji, xpToNextLevel } from './levels.js';

// ─── Chore Definitions ────────────────────────────────────────────────────────
// Edit this list to add/remove chores and their XP values.
// Partners agreed on these XP values upfront.
const CHORES = [
  { name: 'Put leftovers away',               aliases: ['leftovers', 'put leftovers away', 'put away leftovers', 'stored leftovers'],                                          xp: 1  },
  { name: 'Handle mail',                       aliases: ['mail', 'handle mail', 'sorted mail', 'checked mail'],                                                                xp: 1  },
  { name: 'Start dishwasher',                  aliases: ['start dishwasher', 'started dishwasher', 'ran dishwasher'],                                                          xp: 1  },
  { name: 'Move to dryer',                     aliases: ['dryer', 'move to dryer', 'moved to dryer', 'switched laundry'],                                                      xp: 1  },
  { name: 'Replace trash bag',                 aliases: ['trash bag', 'replace trash bag', 'new trash bag', 'changed trash bag'],                                               xp: 1  },
  { name: 'Pick up dinner',                    aliases: ['pick up dinner', 'picked up dinner', 'grabbed dinner', 'takeout', 'take out'],                                        xp: 2  },
  { name: 'Start laundry',                     aliases: ['start laundry', 'started laundry', 'laundry', 'washed clothes', 'washing machine'],                                  xp: 2  },
  { name: 'Bring laundry upstairs',            aliases: ['bring laundry upstairs', 'brought laundry up', 'laundry upstairs'],                                                  xp: 2  },
  { name: 'Water plants',                      aliases: ['water plants', 'watered plants', 'watering plants', 'plants'],                                                       xp: 2  },
  { name: 'Clean bathroom mirror',             aliases: ['bathroom mirror', 'clean bathroom mirror', 'cleaned mirror', 'wiped mirror'],                                         xp: 2  },
  { name: 'Empty dishwasher',                  aliases: ['empty dishwasher', 'emptied dishwasher', 'unloaded dishwasher', 'unload dishwasher'],                                 xp: 3  },
  { name: 'Take recycling to curb',            aliases: ['recycling', 'take recycling to curb', 'took recycling out', 'recycling to curb'],                                    xp: 3  },
  { name: 'Put dishes in dishwasher',          aliases: ['dishes', 'put dishes in dishwasher', 'loaded dishwasher', 'load dishwasher', 'dish'],                                xp: 3  },
  { name: 'Empty bathroom trash (upstairs)',   aliases: ['bathroom trash upstairs', 'empty bathroom trash upstairs', 'upstairs trash', 'upstairs bathroom trash'],              xp: 3  },
  { name: 'Empty bathroom trash (downstairs)', aliases: ['bathroom trash downstairs', 'empty bathroom trash downstairs', 'downstairs trash', 'downstairs bathroom trash'],     xp: 3  },
  { name: 'Put away groceries',                aliases: ['put away groceries', 'groceries', 'unloaded groceries', 'unpacked groceries'],                                        xp: 3  },
  { name: 'Fold/put away towels',              aliases: ['towels', 'fold towels', 'put away towels', 'folded towels'],                                                         xp: 3  },
  { name: 'Take trash to curb',                aliases: ['trash to curb', 'take trash to curb', 'took trash out', 'garbage to curb'],                                          xp: 3  },
  { name: 'Vacuum bedroom',                    aliases: ['vacuum bedroom', 'vacuumed bedroom', 'bedroom vacuum'],                                                               xp: 3  },
  { name: 'Take out kitchen trash',            aliases: ['kitchen trash', 'take out kitchen trash', 'emptied kitchen trash', 'took out trash'],                                xp: 4  },
  { name: 'Clean counters/stove',              aliases: ['counters', 'stove', 'clean counters', 'wiped counters', 'cleaned stove', 'wiped stove', 'counters and stove'],       xp: 4  },
  { name: 'Hand wash dishes',                  aliases: ['hand wash', 'hand washed dishes', 'washed dishes', 'hand washing'],                                                  xp: 4  },
  { name: 'Tidy common areas',                 aliases: ['tidy', 'tidied up', 'organized', 'common areas', 'picked up', 'decluttered'],                                        xp: 4  },
  { name: 'Dust blinds',                       aliases: ['blinds', 'dust blinds', 'dusted blinds', 'bedroom blinds'],                                                          xp: 4  },
  { name: 'Clean up from meal',                aliases: ['clean up', 'cleaned up', 'after dinner', 'after meal', 'post meal cleanup', 'cleared table'],                        xp: 5  },
  { name: 'Clean bathroom sink (upstairs)',    aliases: ['upstairs sink', 'bathroom sink upstairs', 'clean upstairs sink', 'upstairs bathroom sink'],                          xp: 5  },
  { name: 'Clean bathroom sink (downstairs)',  aliases: ['downstairs sink', 'bathroom sink downstairs', 'clean downstairs sink', 'downstairs bathroom sink'],                  xp: 5  },
  { name: 'Vacuum living room',                aliases: ['vacuum living room', 'vacuumed living room', 'living room vacuum', 'vacuumed kitchen', 'swept'],                     xp: 5  },
  { name: 'Change bed sheets',                 aliases: ['sheets', 'change sheets', 'changed sheets', 'bed sheets', 'made bed', 'changed bed'],                                xp: 5  },
  { name: 'Clean sink/disposal',               aliases: ['sink', 'disposal', 'clean sink', 'cleaned sink', 'garbage disposal', 'kitchen sink'],                               xp: 5  },
  { name: 'Clean toilet (upstairs)',           aliases: ['upstairs toilet', 'cleaned toilet upstairs', 'scrubbed toilet upstairs', 'toilet upstairs'],                         xp: 6  },
  { name: 'Clean toilet (downstairs)',         aliases: ['downstairs toilet', 'cleaned toilet downstairs', 'scrubbed toilet downstairs', 'toilet downstairs'],                 xp: 6  },
  { name: 'Made a meal',                       aliases: ['cooked', 'made dinner', 'made lunch', 'cooked meal', 'made food', 'cooked for both', 'made a meal', 'meal'],         xp: 7  },
  { name: 'Grocery shopping',                  aliases: ['groceries', 'grocery', 'grocery shopping', 'went to store', 'food shopping'],                                        xp: 7  },
  { name: 'Mow lawn',                          aliases: ['mow', 'mowed', 'lawn', 'mowed lawn', 'cut grass'],                                                                   xp: 7  },
  { name: 'Empty old food from fridge',        aliases: ['fridge', 'clean fridge', 'old food', 'emptied fridge', 'cleaned out fridge', 'organized fridge'],                   xp: 8  },
  { name: 'Scrub shower/tub',                  aliases: ['shower', 'tub', 'scrubbed shower', 'scrubbed tub', 'cleaned shower', 'bathroom tub'],                               xp: 9  },
  { name: 'Rake leaves',                       aliases: ['rake', 'raked', 'leaves', 'raked leaves', 'yard leaves'],                                                            xp: 10 },
  { name: 'Costco run',                        aliases: ['costco', 'costco run', 'went to costco', 'costco shopping'],                                                         xp: 10 },
  { name: 'Shovel snow',                       aliases: ['shovel', 'shoveled', 'snow', 'shoveled snow', 'cleared snow'],                                                       xp: 10 },
];

// ─── Partner Registry ─────────────────────────────────────────────────────────
// Phone numbers → partner names. Add your numbers here.
// Format: +1XXXXXXXXXX
function getPartnerName(phoneNumber, env) {
  const registry = {
    [env.PARTNER1_PHONE]: env.PARTNER1_NAME || 'Partner 1',
    [env.PARTNER2_PHONE]: env.PARTNER2_NAME || 'Partner 2',
  };
  return registry[phoneNumber] || null;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Dashboard API endpoints
    if (url.pathname === '/api/stats' && request.method === 'GET') {
      return handleStatsApi(env);
    }


    if (url.pathname === '/api/chores' && request.method === 'GET') {
      return new Response(JSON.stringify(CHORES), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (url.pathname === '/api/log' && request.method === 'GET') {
      return handleLogApi(env);
    }

    if (url.pathname === '/api/daily' && request.method === 'GET') {
      return handleDailyApi(env);
    }

    // Twilio SMS webhook
    if (url.pathname === '/sms' && request.method === 'POST') {
      return handleSms(request, env, ctx);
    }

    return new Response('Chore Tracker is running! 🏠', { status: 200 });
  }
};

// ─── SMS Handler ──────────────────────────────────────────────────────────────
async function handleSms(request, env, ctx) {
  const formData = await request.formData();
  const from = formData.get('From');       // e.g. "+15551234567"
  const body = (formData.get('Body') || '').trim().toLowerCase();

  const partnerName = getPartnerName(from, env);

  // Unknown number
  if (!partnerName) {
    return twimlResponse("❌ Your number isn't registered. Ask your partner to add you in the config!");
  }

  // Special commands
  if (body === 'stats' || body === 'score' || body === 'xp') {
    return handleStatsCommand(partnerName, env);
  }

  if (body === 'help' || body === '?') {
    return twimlResponse(buildHelpMessage());
  }

  if (body === 'list' || body === 'chores') {
    return twimlResponse(buildChoreList());
  }

  // Fuzzy match the chore
  const match = fuzzyMatch(body, CHORES);

  if (!match) {
    return twimlResponse(
      `🤔 Couldn't match "${body}" to a chore.\n\nTry "list" for all chores, or "help" for commands.`
    );
  }

  // Log to Google Sheets
  const token = await getGoogleToken(env);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
  const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit' });

  await appendChoreLog(env, token, {
    date: dateStr,
    time: timeStr,
    partner: partnerName,
    chore: match.name,
    xp: match.xp,
    rawInput: body,
  });

  // Get updated stats for reply
  const stats = await getStats(env, token, partnerName);
  const level = getLevel(stats.monthXP);
  const emoji = getLevelEmoji(level);
  const toNext = xpToNextLevel(stats.monthXP);

  const reply = [
    `✅ Logged: ${match.name} (+${match.xp} XP)`,
    ``,
    `📊 ${partnerName}'s Stats`,
    `• Today: ${stats.todayXP} XP`,
    `• This week: ${stats.weekXP} XP`,
    `• This month: ${stats.monthXP} XP`,
    ``,
    `${emoji} Level: ${level}`,
    toNext ? `• ${toNext} XP to next level` : `• MAX LEVEL! 👑`,
    ``,
    `🏆 vs ${stats.partnerName}: ${stats.monthXP} vs ${stats.partnerMonthXP} XP`,
  ].join('\n');

  return twimlResponse(reply);
}

// ─── Stats Command ────────────────────────────────────────────────────────────
async function handleStatsCommand(partnerName, env) {
  const token = await getGoogleToken(env);
  const stats = await getStats(env, token, partnerName);
  const level = getLevel(stats.monthXP);
  const emoji = getLevelEmoji(level);

  const reply = [
    `📊 ${partnerName}'s Stats`,
    `─────────────────`,
    `• Today: ${stats.todayXP} XP`,
    `• This week: ${stats.weekXP} XP`,
    `• This month: ${stats.monthXP} XP`,
    `• All time: ${stats.totalXP} XP`,
    ``,
    `${emoji} ${level}`,
    ``,
    `🏆 Monthly Leaderboard`,
    `${partnerName}: ${stats.monthXP} XP`,
    `${stats.partnerName}: ${stats.partnerMonthXP} XP`,
    stats.monthXP > stats.partnerMonthXP
      ? `\n🥇 You're winning this month!`
      : stats.monthXP < stats.partnerMonthXP
      ? `\n😤 ${stats.partnerName} is ahead — time to catch up!`
      : `\n🤝 You're tied!`,
  ].join('\n');

  return twimlResponse(reply);
}

// ─── Stats API (for dashboard) ────────────────────────────────────────────────
async function handleStatsApi(env) {
  const token = await getGoogleToken(env);
  const [p1Stats, p2Stats] = await Promise.all([
    getStats(env, token, env.PARTNER1_NAME),
    getStats(env, token, env.PARTNER2_NAME),
  ]);

  return new Response(
    JSON.stringify({ partner1: { ...p1Stats, partnerName: env.PARTNER1_NAME }, partner2: { ...p2Stats, partnerName: env.PARTNER2_NAME }, chores: CHORES }),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  );
}

// ─── Log API (recent chores) ──────────────────────────────────────────────────
async function handleLogApi(env) {
  const token = await getGoogleToken(env);
  const log = await getRecentLog(env, token, 30);
  return new Response(JSON.stringify(log), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// ─── Daily XP API (for charts) ───────────────────────────────────────────────
async function handleDailyApi(env) {
  const token = await getGoogleToken(env);
  const daily = await getDailyXP(env, token);
  return new Response(JSON.stringify(daily), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// ─── Help Messages ────────────────────────────────────────────────────────────
function buildHelpMessage() {
  return [
    `🏠 Chore Tracker Help`,
    `─────────────────`,
    `Just text what you did!`,
    `  "took out trash"`,
    `  "cooked dinner"`,
    `  "shoveled"`,
    ``,
    `Commands:`,
    `  "stats" — see your XP`,
    `  "list"  — see all chores`,
    `  "help"  — this message`,
  ].join('\n');
}

function buildChoreList() {
  const lines = ['🧹 Chores & XP:', '─────────────────'];
  for (const c of CHORES) {
    lines.push(`• ${c.name}: ${c.xp} XP`);
  }
  return lines.join('\n');
}
