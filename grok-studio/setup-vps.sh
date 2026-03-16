#!/bin/bash
# ============================================================
#  Grok Studio — VPS Setup Script
#  Chạy: bash setup-vps.sh
#  Yêu cầu: Ubuntu 22.04+, Docker, Node 20+, Python 3.11+
# ============================================================
set -e

echo "============================================"
echo "  GROK STUDIO — VPS AUTO SETUP"
echo "============================================"

# ── 1. Install dependencies ──
echo ""
echo "[1/6] Cài đặt dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq docker.io docker-compose-plugin curl git ufw

# Start Docker
sudo systemctl enable docker
sudo systemctl start docker

# ── 2. Start FlareSolverr (CF auto-solver) ──
echo ""
echo "[2/6] Khởi động FlareSolverr..."
sudo docker pull ghcr.io/flaresolverr/flaresolverr:latest
sudo docker rm -f flaresolverr 2>/dev/null || true
sudo docker run -d \
  --name flaresolverr \
  --restart unless-stopped \
  -p 8191:8191 \
  -e LOG_LEVEL=info \
  -e CAPTCHA_SOLVER=none \
  ghcr.io/flaresolverr/flaresolverr:latest
echo "  ✓ FlareSolverr running on port 8191"

# ── 3. Configure Grok2API ──
echo ""
echo "[3/6] Cấu hình Grok2API..."

# Enable CF auto-refresh via FlareSolverr
# This updates the runtime config through the API
# Will be called after Grok2API starts

# ── 4. Install Python deps ──
echo ""
echo "[4/6] Cài đặt Python dependencies..."
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt 2>/dev/null || pip install -q fastapi uvicorn curl_cffi orjson loguru tomli

# ── 5. Start Grok2API ──
echo ""
echo "[5/6] Khởi động Grok2API..."
cat > /tmp/grok2api.service << 'EOF'
[Unit]
Description=Grok2API Server
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=WORKDIR
ExecStart=WORKDIR/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF
sed -i "s|WORKDIR|$(pwd)|g" /tmp/grok2api.service
sudo cp /tmp/grok2api.service /etc/systemd/system/grok2api.service
sudo systemctl daemon-reload
sudo systemctl enable grok2api
sudo systemctl restart grok2api
echo "  ✓ Grok2API running on port 8000"

# Wait for Grok2API to start
sleep 3

# ── 6. Enable CF auto-refresh in Grok2API config ──
echo ""
echo "[6/6] Bật CF auto-refresh..."
curl -s -X POST http://localhost:8000/v1/admin/config \
  -H "Authorization: Bearer grok2api" \
  -H "Content-Type: application/json" \
  -d '{
    "proxy": {
      "enabled": true,
      "flaresolverr_url": "http://localhost:8191",
      "refresh_interval": 1800
    },
    "app": {
      "video_format": "url"
    }
  }' | python3 -c "import sys,json; print('  ✓', json.load(sys.stdin).get('message','OK'))" 2>/dev/null || echo "  ⚠ Grok2API chưa sẵn sàng, cấu hình sau"

echo ""
echo "============================================"
echo "  SETUP HOÀN TẤT!"
echo "============================================"
echo ""
echo "Services:"
echo "  • Grok2API:     http://localhost:8000"
echo "  • FlareSolverr: http://localhost:8191"
echo ""
echo "CF auto-refresh: Mỗi 30 phút FlareSolverr tự giải CF challenge"
echo "Khách hàng chỉ cần dán SSO cookie — KHÔNG cần biết cf_clearance"
echo ""
echo "Bước tiếp theo:"
echo "  1. Deploy CF Worker: cd grok-studio/worker && npx wrangler deploy"
echo "  2. Set GROK_API_BASE trong wrangler.toml = http://YOUR_VPS_IP:8000"
echo "  3. Hoặc dùng cloudflared tunnel để expose qua HTTPS"
echo ""
echo "Kiểm tra:"
echo "  curl http://localhost:8000/v1/admin/config -H 'Authorization: Bearer grok2api'"
echo "  sudo docker logs flaresolverr --tail 20"
echo "  sudo journalctl -u grok2api -f"
