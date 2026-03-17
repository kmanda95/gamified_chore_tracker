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
  { name: 'Dishes',             aliases: ['dishes', 'dish', 'washed dishes', 'loaded dishwasher', 'unloaded dishwasher', 'dishwasher'],          xp: 10 },
  { name: 'Vacuumed',           aliases: ['vacuum', 'vacuumed', 'vacuuming', 'swept'],                                                           xp: 15 },
  { name: 'Took out trash',     aliases: ['trash', 'garbage', 'took out trash', 'took out garbage', 'emptied trash'],                            xp: 10 },
  { name: 'Cleaned bathroom',   aliases: ['bathroom', 'cleaned bathroom', 'scrubbed bathroom', 'toilet', 'scrubbed toilet'],                     xp: 20 },
  { name: 'Mopped',             aliases: ['mop', 'mopped', 'mopping', 'wet mop'],                                                                xp: 15 },
  { name: 'Laundry',            aliases: ['laundry', 'switched laundry', 'started laundry', 'folded laundry', 'put away laundry', 'washed clothes', 'dryer'], xp: 15 },
  { name: 'Grocery shopping',   aliases: ['groceries', 'grocery', 'shopping', 'went to store', 'food shopping'],                                 xp: 20 },
  { name: 'Costco run',         aliases: ['costco', 'costco run', 'went to costco'],                                                             xp: 30 },
  { name: 'Cooked meal',        aliases: ['cooked', 'cooking', 'made dinner', 'made lunch', 'made breakfast', 'cooked dinner', 'cooked meal', 'made food'], xp: 25 },
  { name: 'Shoveled snow',      aliases: ['shoveled', 'shovel', 'shoveling', 'shoveled snow', 'cleared snow', 'snow'],                          xp: 35 },
  { name: 'Mowed lawn',         aliases: ['mowed', 'mow', 'lawn', 'mowed lawn', 'cut grass'],                                                   xp: 25 },
  { name: 'Cleaned kitchen',    aliases: ['cleaned kitchen', 'wiped kitchen', 'kitchen'],                                                        xp: 15 },
  { name: 'Wiped counters',     aliases: ['wiped counters', 'counters', 'wiped down'],                                                           xp: 8  },
  { name: 'Fed pets',           aliases: ['fed cat', 'fed dog', 'fed pets', 'fed the cat', 'fed the dog', 'pet food'],                          xp: 5  },
  { name: 'Litter box',         aliases: ['litter', 'litter box', 'cat litter', 'cleaned litter'],                                               xp: 10 },
  { name: 'Took out recycling', aliases: ['recycling', 'recycle', 'took out recycling'],                                                         xp: 8  },
  { name: 'Cleaned fridge',     aliases: ['fridge', 'cleaned fridge', 'organized fridge'],                                                       xp: 15 },
  { name: 'Dusted',             aliases: ['dusted', 'dusting', 'dust'],                                                                          xp: 12 },
  { name: 'Cleaned car',        aliases: ['cleaned car', 'washed car', 'car'],                                                                   xp: 20 },
  { name: 'Errands',            aliases: ['errands', 'ran errands', 'picked up'],                                                                xp: 15 },
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
