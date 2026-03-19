# 🏠 Chore Quest — Setup & Deployment Guide

A gamified household chore tracker using SMS (Twilio), Google Sheets, and Cloudflare Workers.

---

## Architecture Overview

```
Partner texts Twilio number
        ↓
Twilio sends webhook → Cloudflare Worker (/sms)
        ↓
Worker fuzzy-matches chore → logs to Google Sheets
   (auto-creates "Mar 2026" tab if it doesn't exist)
        ↓
Worker replies via SMS with XP update + level
        ↓
Dashboard (Cloudflare Pages) reads from Worker API:
  GET /api/stats  → both partners' XP totals
  GET /api/daily  → daily XP breakdown for charts
  GET /api/log    → 30 most recent chore entries
```

---

## Prerequisites

- [Cloudflare account](https://cloudflare.com) (free tier works)
- [Twilio account](https://twilio.com) (~$1/month for a phone number)
- [Google Cloud account](https://console.cloud.google.com) (free)
- Node.js 18+ installed locally
- GitHub account

---

## Step 1 — Google Sheets Setup

### 1a. Create your spreadsheet
1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Name it **"Chore Quest"**
3. Copy the spreadsheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/**COPY_THIS_PART**/edit`

> **How tabs work:** The Worker automatically creates a new tab each month named `Mar 2026`, `Apr 2026`, etc. You don't need to set anything up — the first text message will create the first tab. Each tab has columns: `Date | Time | Partner | Chore | XP | Raw Input`. Monthly XP resets naturally because each month reads only its own tab.

### 1b. Create a Service Account
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable the **Google Sheets API**:
   - APIs & Services → Library → search "Google Sheets API" → Enable
4. Create a Service Account:
   - APIs & Services → Credentials → Create Credentials → Service Account
   - Name: `chore-tracker`
   - Role: Editor (or Sheets-specific role)
5. Generate a key:
   - Click your service account → Keys → Add Key → JSON
   - Download the JSON file — keep this safe!
6. **Share your Google Sheet** with the service account email (looks like `chore-tracker@YOUR-PROJECT.iam.gserviceaccount.com`) — give it **Editor** access

### 1c. Verify access
```bash
cd sheets-setup
npm install googleapis
GOOGLE_SERVICE_ACCOUNT_JSON='PASTE_JSON_HERE' \
GOOGLE_SHEET_ID='your-sheet-id' \
node setup-sheet.js
```
This just confirms the service account can reach your sheet. Month tabs are created automatically by the Worker at runtime.

---

## Step 2 — Twilio Setup

1. Buy a phone number at [twilio.com/console](https://console.twilio.com)
   - Choose a local number for your area
   - ~$1.15/month
2. Note your **Account SID** and **Auth Token**
3. You'll configure the webhook URL after deploying the Worker (Step 4)

---

## Step 3 — GitHub Setup

```bash
# Clone or create your repo
git init chore-quest
cd chore-quest
cp -r /path/to/this/project/* .
git add .
git commit -m "Initial chore tracker setup"
gh repo create chore-quest --public --push
```

---

## Step 4 — Deploy the Cloudflare Worker

### 4a. Install Wrangler
```bash
npm install -g wrangler
wrangler login
```

### 4b. Set secrets
```bash
cd worker

# Your Google service account JSON (the entire file contents)
wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
# Paste the entire contents of your service account JSON when prompted

# Your Google Sheet ID
wrangler secret put GOOGLE_SHEET_ID
# Paste: your-sheet-id

# Partner phone numbers (in +1XXXXXXXXXX format)
wrangler secret put PARTNER1_PHONE
# Paste: +15551234567

wrangler secret put PARTNER1_NAME
# Paste: Alex

wrangler secret put PARTNER2_PHONE
# Paste: +15559876543

wrangler secret put PARTNER2_NAME
# Paste: Jordan
```

### 4c. Deploy
```bash
wrangler deploy
```

Note the Worker URL — it'll look like:
`https://chore-tracker.YOUR-SUBDOMAIN.workers.dev`

### 4d. Connect Twilio
1. Go to Twilio Console → Phone Numbers → your number
2. Under "Messaging Configuration":
   - Webhook: `https://chore-tracker.YOUR-SUBDOMAIN.workers.dev/sms`
   - Method: **HTTP POST**
3. Save

### 4e. Test it!
Text your Twilio number: `took out trash`
You should get back:
```
✅ Logged: Took out trash (+10 XP)

📊 Alex's Stats
• Today: 10 XP
• This week: 10 XP
• This month: 10 XP

🌱 Level: Rookie
• 40 XP to next level

🏆 vs Jordan: 10 vs 0 XP
```

---

## Step 5 — Deploy the Dashboard (Cloudflare Pages)

### 5a. Update the API URL
Edit `dashboard/index.html` line:
```javascript
const API_BASE = 'https://chore-tracker.YOUR-SUBDOMAIN.workers.dev';
```

### 5b. Deploy via Cloudflare Pages
Option A — GitHub integration (recommended):
1. Push to GitHub
2. Cloudflare Dashboard → Pages → Create a project → Connect to Git
3. Select your repo
4. Build settings:
   - Build command: *(leave empty)*
   - Build output directory: `dashboard`
5. Deploy!

Option B — Direct upload:
```bash
wrangler pages deploy dashboard --project-name chore-quest
```

Your dashboard will be at: `https://chore-quest.pages.dev`

---

## SMS Commands

| Text | Response |
|------|----------|
| Any chore (e.g., "did laundry") | Logs chore + XP update |
| `stats` or `score` | Full stats breakdown |
| `list` | All chores and XP values |
| `help` | Command reference |

---

## Customizing Chores

Edit `worker/index.js` — the `CHORES` array at the top:

```javascript
const CHORES = [
  { name: 'Dishes', aliases: ['dishes', 'washed dishes'], xp: 10 },
  { name: 'Cooked meal', aliases: ['cooked', 'made dinner'], xp: 25 },
  // Add your own:
  { name: 'Walked dog', aliases: ['walked dog', 'dog walk', 'walked the dog'], xp: 15 },
];
```

Then redeploy: `wrangler deploy`

---

## Level Thresholds (Monthly XP)

| Level | XP Required |
|-------|-------------|
| 🧦 Messy Guest | 0 |
| 🛋️ Roommate | 50 |
| 🔑 Tenant | 125 |
| 🏠 Homeowner | 250 |
| ✨ Neat Freak | 400 |
| 📋 House Manager | 600 |
| 👨‍🍳 Home Chef | 850 |
| 🏡 Estate Lord | 1,150 |
| 👑 Household CEO | 1,500 |

Levels reset on the 1st of each month.

> **To update levels**, edit them in all 3 places:
> 1. `worker/levels.js` — used by the Worker for SMS replies
> 2. `dashboard/index.html` — the live dashboard UI
> 3. `dashboard/new_index.html` — alternate dashboard UI

---

## Monthly Reset

XP rankings automatically reset each month because stats are calculated from the current calendar month only. No manual action needed!

---

## Troubleshooting

**"Your number isn't registered"** — Add your phone number to the Worker secrets (`PARTNER1_PHONE` or `PARTNER2_PHONE`)

**"Couldn't match your chore"** — The fuzzy matcher didn't recognize it. Text `list` to see all chores, or add new aliases in `worker/index.js`

**Google Sheets errors** — Make sure the service account email has Editor access to your sheet

**SMS not arriving** — Check Twilio's error logs in the Console, verify webhook URL is correct

---

## Cost Estimate

| Service | Cost |
|---------|------|
| Cloudflare Workers | Free (100k req/day) |
| Cloudflare Pages | Free |
| Twilio number | ~$1.15/month |
| Twilio SMS (US) | ~$0.0079/message |
| Google Sheets API | Free |
| **Total** | **~$2–3/month** |
