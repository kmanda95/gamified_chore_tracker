/**
 * Google Sheets integration — per-month tab structure.
 *
 * Sheet layout:
 *   One tab per month, named "Mon YYYY" (e.g. "Mar 2026")
 *   Each tab columns: Date | Time | Partner | Chore | XP | Raw Input
 *
 * All-time stats are computed by reading every month tab.
 */

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function getGoogleToken(env) {
  const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const jwt = await signJwt(header, claim, serviceAccount.private_key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth2:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const { access_token } = await res.json();
  return access_token;
}

async function signJwt(header, claim, privateKeyPem) {
  const enc = txt =>
    btoa(JSON.stringify(txt))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  const body = `${enc(header)}.${enc(claim)}`;

  const keyData = pemToArrayBuffer(privateKeyPem);
  const key = await crypto.subtle.importKey(
    'pkcs8', keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key,
    new TextEncoder().encode(body)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${body}.${sigB64}`;
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

// ─── Tab name helpers ─────────────────────────────────────────────────────────

/** Returns tab name for a given Date, e.g. "Mar 2026" */
export function tabNameForDate(date) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Chicago',
  });
}

export function currentTabName() {
  return tabNameForDate(new Date());
}

// ─── Ensure month tab exists ──────────────────────────────────────────────────

/**
 * Creates the tab for `tabName` if it doesn't already exist.
 * Adds a header row and formatting.
 * Returns the numeric sheetId of the tab.
 */
export async function ensureMonthTab(env, token, tabName) {
  const sheetId = env.GOOGLE_SHEET_ID;

  // Check existing sheets
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await metaRes.json();
  const existing = meta.sheets || [];

  const found = existing.find(s => s.properties.title === tabName);
  if (found) return found.properties.sheetId;

  // Create the tab
  const createRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          addSheet: {
            properties: {
              title: tabName,
              gridProperties: { rowCount: 5000, columnCount: 7 },
            },
          },
        }],
      }),
    }
  );
  const createData = await createRes.json();
  const newSheetNumId = createData.replies?.[0]?.addSheet?.properties?.sheetId;

  // Write header row
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName + '!A1:F1')}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [['Date', 'Time', 'Partner', 'Chore', 'XP', 'Raw Input']] }),
    }
  );

  // Bold header + freeze row
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId: newSheetNumId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                  backgroundColor: { red: 0.1, green: 0.12, blue: 0.18 },
                },
              },
              fields: 'userEnteredFormat(textFormat,backgroundColor)',
            },
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId: newSheetNumId,
                gridProperties: { frozenRowCount: 1 },
              },
              fields: 'gridProperties.frozenRowCount',
            },
          },
        ],
      }),
    }
  );

  console.log(`[sheets] Created new month tab: ${tabName}`);
  return newSheetNumId;
}

// ─── Append chore log ─────────────────────────────────────────────────────────

export async function appendChoreLog(env, token, { date, time, partner, chore, xp, rawInput }) {
  const sheetId = env.GOOGLE_SHEET_ID;
  const tabName = currentTabName();

  // Auto-create this month's tab if needed
  await ensureMonthTab(env, token, tabName);

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName + '!A:F')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[date, time, partner, chore, xp, rawInput]] }),
    }
  );
}

// ─── Read all month tabs ──────────────────────────────────────────────────────

/**
 * Returns every chore log row across all month tabs, sorted oldest→newest.
 * Row shape: { date, time, partner, chore, xp, rawInput, tab }
 */
export async function getAllRows(env, token) {
  const sheetId = env.GOOGLE_SHEET_ID;

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await metaRes.json();

  // Only tabs named "Mon YYYY"
  const monthTabPattern = /^[A-Z][a-z]{2} \d{4}$/;
  const monthTabs = (meta.sheets || [])
    .map(s => s.properties.title)
    .filter(t => monthTabPattern.test(t))
    .sort((a, b) => new Date(a) - new Date(b)); // chronological order

  if (monthTabs.length === 0) return [];

  // Batch-read all tabs in one request
  const rangeParams = monthTabs.map(t => `ranges=${encodeURIComponent(t + '!A:F')}`).join('&');
  const batchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${rangeParams}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const batchData = await batchRes.json();

  const allRows = [];
  for (let i = 0; i < monthTabs.length; i++) {
    const tab = monthTabs[i];
    const values = batchData.valueRanges?.[i]?.values || [];
    for (const row of values.slice(1)) { // skip header
      const [date, time, partner, chore, xpStr, rawInput] = row;
      if (!date || !partner) continue;
      allRows.push({ date, time, partner, chore, xp: parseInt(xpStr) || 0, rawInput, tab });
    }
  }

  return allRows;
}

// ─── Stats for a partner ──────────────────────────────────────────────────────

export async function getStats(env, token, partnerName) {
  const rows = await getAllRows(env, token);

  const now = new Date();
  const tz = 'America/Chicago';
  const todayStr = now.toLocaleDateString('en-US', { timeZone: tz });
  const thisTab = currentTabName();

  // Week start (Sunday midnight local)
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const otherPartner = partnerName === env.PARTNER1_NAME ? env.PARTNER2_NAME : env.PARTNER1_NAME;

  let todayXP = 0, weekXP = 0, monthXP = 0, totalXP = 0, partnerMonthXP = 0;
  let partnerNameFound = '';

  for (const row of rows) {
    if (row.partner === partnerName) {
      totalXP += row.xp;
      if (row.date === todayStr) todayXP += row.xp;
      const rowDate = new Date(row.date);
      if (!isNaN(rowDate) && rowDate >= weekStart) weekXP += row.xp;
      if (row.tab === thisTab) monthXP += row.xp;
    } else if (row.partner === otherPartner) {
      if (!partnerNameFound) partnerNameFound = row.partner;
      if (row.tab === thisTab) partnerMonthXP += row.xp;
    }
  }

  return {
    todayXP,
    weekXP,
    monthXP,
    totalXP,
    partnerMonthXP,
    partnerName: partnerNameFound || otherPartner || 'Partner',
  };
}

// ─── Daily XP breakdown (for charts) ─────────────────────────────────────────

export async function getDailyXP(env, token) {
  const rows = await getAllRows(env, token);
  const thisTab = currentTabName();
  const monthRows = rows.filter(r => r.tab === thisTab);

  const p1 = env.PARTNER1_NAME;
  const p2 = env.PARTNER2_NAME;
  const byDay = {};

  for (const row of monthRows) {
    if (!byDay[row.date]) byDay[row.date] = { [p1]: 0, [p2]: 0 };
    if (row.partner === p1) byDay[row.date][p1] += row.xp;
    if (row.partner === p2) byDay[row.date][p2] += row.xp;
  }

  const sortedDates = Object.keys(byDay).sort((a, b) => new Date(a) - new Date(b));

  return {
    dates: sortedDates,
    p1Data: sortedDates.map(d => byDay[d][p1] || 0),
    p2Data: sortedDates.map(d => byDay[d][p2] || 0),
    p1Name: p1,
    p2Name: p2,
  };
}

// ─── Recent log rows (for dashboard) ─────────────────────────────────────────

export async function getRecentLog(env, token, limit = 20) {
  const rows = await getAllRows(env, token);
  // Most recent first
  return rows.reverse().slice(0, limit);
}
