#!/bin/bash
# Deploy Grok Studio to Cloudflare
# Usage:
#   bash grok-studio/deploy.sh           — deploy production
#   bash grok-studio/deploy.sh staging   — deploy staging (dev-grok.liveyt.pro)
#   bash grok-studio/deploy.sh setup-staging — create staging D1 + R2 resources

set -e
export PATH="/Users/phamvanhuy/.nvm/versions/node/v20.20.1/bin:$PATH"

ENV="${1:-production}"
cd "$(dirname "$0")/worker"

if [ "$ENV" = "setup-staging" ]; then
  echo "🔧 Setting up staging resources..."
  echo ""
  echo "1️⃣  Creating D1 staging database..."
  npx wrangler d1 create grok-studio-db-staging || echo "   (already exists)"
  echo ""
  echo "2️⃣  Creating R2 staging bucket..."
  npx wrangler r2 bucket create grok-studio-media-staging || echo "   (already exists)"
  echo ""
  echo "⚠️  IMPORTANT: Copy the D1 database_id from above output"
  echo "   and update STAGING_DB_ID_REPLACE_ME in wrangler.toml [env.staging]"
  echo ""
  echo "3️⃣  After updating wrangler.toml, run schema migration:"
  echo "   bash grok-studio/deploy.sh migrate-staging"
  exit 0
fi

if [ "$ENV" = "migrate-staging" ]; then
  echo "🗄️  Running schema migration on staging DB..."
  npx wrangler d1 execute grok-studio-db-staging --env staging --file=./schema.sql
  echo "✅ Staging DB migrated"
  exit 0
fi

if [ "$ENV" = "staging" ]; then
  echo "🚀 Deploying Grok Studio STAGING..."
  npx wrangler deploy --env staging
  echo ""
  echo "✅ Deployed to: https://dev-grok.liveyt.pro"
  echo ""
  echo "📋 Staging checklist:"
  echo "  1. Staging dùng chung Grok2API: https://api.liveyt.pro"
  echo "  2. DB staging riêng: grok-studio-db-staging"
  echo "  3. R2 staging riêng: grok-studio-media-staging"
  exit 0
fi

# Default: production
echo "🚀 Deploying Grok Studio PRODUCTION..."
npx wrangler deploy
echo ""
echo "✅ Deployed to: https://grok.liveyt.pro"
echo ""
echo "📋 Post-deploy checklist:"
echo "  1. Grok2API running on localhost:8000"
echo "  2. Cloudflare tunnel active: cloudflared tunnel --url http://localhost:8000"
echo "  3. cf_clearance fresh: python grok-studio/solve_cf.py"
echo "  4. Auto-refresh: python grok-studio/cf_refresh_cron.py"
