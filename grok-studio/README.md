# Grok Studio

Web UI cho phép người dùng nhập tài khoản Grok và sử dụng AI để gen video/image hàng loạt.

## Chức năng
- Text → Video: Tạo video từ prompt
- Image → Video: Animate ảnh thành video
- Text → Image: Tạo ảnh từ prompt
- Image → Image: Chỉnh sửa ảnh bằng AI
- Extend Video: Kéo dài video
- History: Lịch sử tạo
- Batch Mode: Gen hàng loạt
- Auth + Plans: Đăng nhập, đăng ký, gói subscription

## Yêu cầu
- Node.js 20 (`nvm use 20`)
- Wrangler CLI (đã login)
- Grok2API backend đang chạy

## Setup

### 1. Tạo D1 Database
```bash
cd grok-studio/worker
npx wrangler d1 create grok-studio-db
```
Copy `database_id` từ output vào `wrangler.toml`.

### 2. Migrate Database
```bash
npx wrangler d1 execute grok-studio-db --local --file=./schema.sql
```

### 3. Cấu hình
Sửa `wrangler.toml`:
- `JWT_SECRET`: Đổi secret key
- `GROK_API_BASE`: URL của Grok2API backend

### 4. Dev local
```bash
npm install
npm run dev
```

### 5. Deploy production
```bash
# Migrate DB production
npx wrangler d1 execute grok-studio-db --file=./schema.sql

# Deploy
npm run deploy
```

## Kiến trúc
- **Worker** (Cloudflare Workers): Auth, user management, proxy requests tới Grok2API
- **Frontend** (Static): Liquid glass UI, served bởi Workers Sites
- **D1**: SQLite database cho users, accounts, history, plans
