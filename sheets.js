#!/bin/bash
# Run this once from your project root to set all required Cloudflare Worker secrets.
# Prerequisites: `wrangler` CLI installed and logged in (`wrangler login`)
#
# Your service account JSON file (downloaded from Google Cloud Console) looks like:
# {
#   "type": "service_account",
#   "project_id": "lofty-sonar-471717-f8",
#   "private_key_id": "...",
#   "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
#   "client_email": "gamified-chore-tracker@lofty-sonar-471717-f8.iam.gserviceaccount.com",
#   ...
# }

WORKER_NAME="chore-tracker-worker"

echo "Setting Cloudflare Worker secrets for: $WORKER_NAME"
echo "------------------------------------------------------"
echo ""

# ── Service account email ──────────────────────────────────────────────────────
# Copy the "client_email" value from your service account JSON
echo "gamified-chore-tracker@lofty-sonar-471717-f8.iam.gserviceaccount.com" \
  | wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL --name $WORKER_NAME

# ── Private key ────────────────────────────────────────────────────────────────
# Extract just the private_key field from your service account JSON and pipe it in.
# The key must be the full PEM string including the BEGIN/END headers.
#
# Easy way — extract it with jq:
#   cat /path/to/your-service-account.json | jq -r '.private_key' | wrangler secret put GOOGLE_PRIVATE_KEY --name $WORKER_NAME
#
# Or paste it interactively:
echo "Paste your private key now (the full PEM including -----BEGIN PRIVATE KEY----- header):"
wrangler secret put GOOGLE_PRIVATE_KEY --name $WORKER_NAME

# ── Sheet ID ───────────────────────────────────────────────────────────────────
# From your Google Sheet URL:
# https://docs.google.com/spreadsheets/d/SHEET_ID_IS_HERE/edit
echo "YOUR_GOOGLE_SHEET_ID_HERE" \
  | wrangler secret put GOOGLE_SHEET_ID --name $WORKER_NAME

# ── Partner info ───────────────────────────────────────────────────────────────
echo "Kayla" | wrangler secret put PARTNER1_NAME --name $WORKER_NAME
echo "+1XXXXXXXXXX" | wrangler secret put PARTNER1_PHONE --name $WORKER_NAME   # E.164 format

echo "PARTNER2_NAME_HERE" | wrangler secret put PARTNER2_NAME --name $WORKER_NAME
echo "+1XXXXXXXXXX" | wrangler secret put PARTNER2_PHONE --name $WORKER_NAME   # E.164 format

echo ""
echo "✅ All secrets set! Run 'wrangler secret list --name $WORKER_NAME' to verify."
