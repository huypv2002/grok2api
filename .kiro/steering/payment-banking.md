---
inclusion: fileMatch
fileMatchPattern: "**/payment*,**/admin*,**/bank*"
---

# Payment & Banking — Hướng dẫn

## Tổng quan
Thanh toán qua chuyển khoản ngân hàng ACB, tích hợp Web2M API để:
1. Tạo QR code thanh toán
2. Nhận webhook khi có giao dịch mới
3. Xem lịch sử giao dịch ngân hàng (superadmin)

## Flow thanh toán
```
User chọn gói → POST /api/payment/create → tạo order + memo code
  → Hiển thị QR (Web2M quicklink API)
  → User chuyển khoản với nội dung = memo code
  → Web2M gửi webhook POST /api/webhook/web2m
  → Worker match memo_code với pending order
  → Upgrade plan + ghi commission (nếu có referral)
```

## Web2M API
- QR: `https://api.web2m.com/quicklink/ACB/{account}/{name}?amount=X&memo=Y`
- Lịch sử: `https://api.web2m.com/historyapiacb/{password}/{account}/{token}`
- Lịch sử theo ngày: thêm `/{DD-MM-YYYY}` vào cuối URL
- Webhook: Web2M POST tới `/api/webhook/web2m` với Bearer token = `WEB2M_TOKEN`
- Webhook payload: `{ status: true, data: [{ type: 'IN'|'OUT', amount, description, transactionID }] }`

## Config (wrangler.toml)
- `ACB_ACCOUNT` — Số tài khoản ACB
- `ACB_PASSWORD` — Mật khẩu Web2M API
- `ACB_API_TOKEN` — Token Web2M API
- `WEB2M_TOKEN` — Token xác thực webhook

## Database tables
- `payment_orders` — Đơn hàng: user_id, plan_id, amount, memo_code, status, transaction_ref
- `service_plans` — Gói dịch vụ: id, name, tier, price, days, accs
- `commissions` — Hoa hồng CTV: affiliate_id, order_id, amount, commission, rate

## Memo code format
`GS{userId}{timestamp_base36}` — ví dụ: `GS5M1ABC2D`

## Bank transactions tab (superadmin)
- Frontend: `renderAdmBank()`, `loadAdmBank()`, `filterBankTx()`
- Backend: `GET /api/admin/bank-transactions?fromDate=DD-MM-YYYY&toDate=DD-MM-YYYY`
- Mặc định Web2M chỉ trả 1 ngày, backend loop fetch từng ngày trong range (max 90 ngày)
- Frontend có date picker, filter theo loại (IN/OUT), search nội dung
