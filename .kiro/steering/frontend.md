---
inclusion: fileMatch
fileMatchPattern: "grok-studio/frontend/**"
---

# Frontend — Hướng dẫn

## Cấu trúc
```
grok-studio/frontend/
├── index.html        — SPA shell, sidebar nav, auth screen, page container
├── js/
│   ├── bundle.js     — Logic chính: API client, tất cả page renders, admin panels
│   └── app.js        — Auth flow, session init, page switching
├── css/
│   └── main.css      — Glass morphism theme, responsive layout
└── (served bởi CF Workers ASSETS binding)
```

## Kiến trúc SPA
- Không dùng framework, vanilla JS thuần
- Navigation: `go('page-name')` → gọi `renderXxx()` trả HTML string → inject vào `#content`
- Mỗi page có pattern: `renderXxx()` trả HTML, `loadXxx()` fetch data, `filterXxx()` lọc client-side
- Pagination: `_pgHtml(page, total, callbackName)` helper

## API Client (bundle.js)
```js
const API = {
  req: (path, opts) => fetch('/api' + path, { headers: { Authorization: 'Bearer ' + token }, ...opts }),
  login: (email, pw) => ...,
  register: (email, pw, name) => ...,
  me: () => ...,
  accounts: { list, add, del, bulk },
  generate: (body) => ...,
  history: { list, del, fav },
  admin: { users, updateUser, deleteUser, accounts, plans, ... },
  bank: { transactions: (q) => API.req('/admin/bank-transactions' + (q ? '?' + q : '')) },
  aff: { ... },
  payment: { create, check, history }
};
```

## Quy ước
- Tất cả logic nằm trong `bundle.js` (file lớn, ~3000+ dòng)
- `app.js` chỉ xử lý auth init và page switching cơ bản
- HTML render bằng template literals, không dùng DOM manipulation phức tạp
- Toast notifications: `toast(msg, 'ok'|'err'|'warn')`
- Format tiền VN: `fmtVND(amount)` → "149.000₫"
- Escape HTML: `esc(str)`
- Admin pages prefix: `renderAdm*`, `loadAdm*`
- Superadmin sections: bank, webhook logs

## Sidebar Navigation
- User pages: text2video, image2video, text2image, image2image, extend, video_project, history, accounts, pricing, guide, profile
- Admin pages: admin-dash, admin-users, admin-tokens, admin-hist, admin-plans, admin-pay, admin-ctv, admin-comms, admin-redemptions
- Superadmin: admin-bank

## Styling
- CSS variables: `--ok` (green), `--err` (red), `--warn` (yellow), `--text2` (muted)
- Glass cards: `.glass-card`, `.glass-panel`
- Tables: `.adm-tbl` với `.tbl-wrap`
- Buttons: `.btn-s` (small), `.btn-primary`
- Responsive: mobile sidebar overlay, `.mobile-header`
