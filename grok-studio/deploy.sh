#!/bin/bash
# Deploy Grok Studio to Cloudflare
# Usage: bash grok-studio/deploy.sh

set -e
export PATH="/Users/phamvanhuy/.nvm/versions/node/v20.20.1/bin:$PATH"

echo "🚀 Deploying Grok Studio..."
cd "$(dirname "$0")/worker"
wrangler deploy
echo ""
echo "✅ Deployed to: https://grok-studio.kh431248.workers.dev"
echo ""
echo "📋 Post-deploy checklist:"
echo "  1. Grok2API running on localhost:8000"
echo "  2. Cloudflare tunnel active: cloudflared tunnel --url http://localhost:8000"
echo "  3. cf_clearance fresh: python grok-studio/solve_cf.py"
echo "  4. Auto-refresh: python grok-studio/cf_refresh_cron.py"
