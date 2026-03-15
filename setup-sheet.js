/**
 * Run this once to verify your Google Sheet is accessible.
 * The Worker auto-creates month tabs as needed — no manual setup required.
 *
 * Usage: node setup-sheet.js
 *
 * Prerequisites:
 *   npm install googleapis
 *   Set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_SHEET_ID env vars
 */

const { google } = require('googleapis');

async function setup() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!credentials || !sheetId) {
    console.error('❌ Missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SHEET_ID env vars');
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Verify access
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  console.log(`✅ Connected to sheet: "${meta.data.properties.title}"`);
  console.log(`   URL: https://docs.google.com/spreadsheets/d/${sheetId}`);
  console.log('');
  console.log('ℹ️  Month tabs are created automatically by the Worker.');
  console.log('   The first tab (e.g. "Mar 2026") will appear when a chore is first logged.');
  console.log('');
  console.log('Existing tabs:', meta.data.sheets.map(s => s.properties.title).join(', ') || '(none yet)');
  console.log('');
  console.log('🏠 Setup verified! You\'re ready to deploy the Worker.');
}

setup().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
