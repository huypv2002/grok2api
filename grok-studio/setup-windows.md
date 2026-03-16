# Grok Studio — Setup VPS Windows 10 (4GB RAM, không Docker)

## Kiến trúc

```
Browser → CF Worker (Cloudflare)
              ↓
         Cloudflared Tunnel
              ↓
         VPS Windows 10
         ├── Grok2API (:8000) — ~100MB RAM
         ├── CF Refresh (zendriver) — ~200MB khi giải, ~20MB idle
         └── Cloudflared — ~30MB RAM
              ↓
         grok.com
```

Tổng RAM: ~350MB peak, ~150MB idle. Phù hợp VPS 4GB.

---

## Bước 1: Cài phần mềm

Mở trình duyệt trên VPS, tải và cài:

| Phần mềm | Link | Lưu ý |
|-----------|------|-------|
| Python 3.11+ | https://www.python.org/downloads/ | ✅ TICK "Add to PATH" |
| Git | https://git-scm.com/download/win | Mặc định |
| Node.js 20 | https://nodejs.org/ | Chọn LTS |
| Google Chrome | https://www.google.com/chrome/ | Cần cho zendriver |
| Cloudflared | https://github.com/cloudflare/cloudflared/releases | Tải `cloudflared-windows-amd64.exe`, đổi tên `cloudflared.exe`, copy vào `C:\Windows\` |

Sau khi cài xong, mở CMD kiểm tra:
```cmd
python --version
git --version
node --version
cloudflared --version
```

---

## Bước 2: Clone project

```cmd
cd C:\
git clone <your-repo-url> grok2api
cd grok2api
```

Hoặc copy folder code vào `C:\grok2api`.

---

## Bước 3: Cài Python dependencies

```cmd
cd C:\grok2api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install zendriver user-agents
```

---

## Bước 4: Chạy tất cả

Double-click file `grok-studio\start-all.bat`

Hoặc mở CMD:
```cmd
cd C:\grok2api
grok-studio\start-all.bat
```

Sẽ mở 3 cửa sổ CMD:
1. **Grok2API** — server chính
2. **CF-Refresh** — tự giải CF mỗi 25 phút (Chrome mở rồi đóng)
3. **Cloudflared** — tunnel HTTPS

---

## Bước 5: Lấy Tunnel URL

Trong cửa sổ **Cloudflared**, tìm dòng:
```
Your quick Tunnel has been created! Visit it at:
https://xxx-xxx-xxx-xxx.trycloudflare.com
```

Copy URL đó.

---

## Bước 6: Cập nhật Worker

Trên máy Mac/local (không phải VPS), sửa file `grok-studio/worker/wrangler.toml`:

```toml
[vars]
GROK_API_BASE = "https://xxx-xxx-xxx-xxx.trycloudflare.com"
```

Deploy:
```bash
cd grok-studio/worker
npx wrangler deploy
```

---

## Bước 7: Thêm SSO Token

Có 2 cách:

**Cách 1 — Qua Grok Studio UI:**
- Vào https://grok-studio.kh431248.workers.dev
- Đăng nhập admin
- Vào "My Accounts" → dán cookie JSON

**Cách 2 — Qua CMD trên VPS:**
```cmd
curl -X POST http://localhost:8000/v1/admin/tokens -H "Authorization: Bearer grok2api" -H "Content-Type: application/json" -d "{\"ssoBasic\":[{\"token\":\"PASTE_SSO_HERE\"}]}"
```

---

## Tự động chạy khi khởi động

1. Nhấn `Win + R` → gõ `shell:startup` → Enter
2. Tạo shortcut của `C:\grok2api\grok-studio\start-all.bat` trong folder đó

---

## Xử lý sự cố

### Quick tunnel URL thay đổi khi restart
Mỗi lần restart cloudflared, URL mới. Giải pháp:
- **Tạm**: Copy URL mới → sửa wrangler.toml → redeploy
- **Vĩnh viễn**: Dùng Named Tunnel (cần domain):
  ```cmd
  cloudflared tunnel login
  cloudflared tunnel create grok-studio
  cloudflared tunnel route dns grok-studio api.yourdomain.com
  cloudflared tunnel run grok-studio
  ```

### CF refresh thất bại
- Kiểm tra Chrome đã cài chưa
- Thử chạy thủ công: `.venv\Scripts\activate && python grok-studio\cf_service_win.py`
- zendriver cần Chrome/Chromium — nếu lỗi, cài Chrome

### Grok2API lỗi "No available tokens"
- Token hết quota → đợi vài giờ hoặc thêm token mới
- Kiểm tra: `curl http://localhost:8000/v1/admin/tokens -H "Authorization: Bearer grok2api"`

### Kiểm tra services
```cmd
:: Grok2API alive?
curl http://localhost:8000/v1/admin/verify -H "Authorization: Bearer grok2api"

:: Xem config
curl http://localhost:8000/v1/admin/config -H "Authorization: Bearer grok2api"

:: Xem tokens
curl http://localhost:8000/v1/admin/tokens -H "Authorization: Bearer grok2api"
```
