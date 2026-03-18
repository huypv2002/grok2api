import { jsonResponse, corsHeaders } from '../utils/response.js';

const ACB_ACCOUNT = '24876591';
const ACB_NAME = 'NGUYEN VAN VIET';

// Helper: load plan from DB
async function getPlan(env, planId) {
  const row = await env.DB.prepare('SELECT * FROM service_plans WHERE id = ? AND active = 1').bind(planId).first();
  if (!row) return null;
  return { name: row.name, price: row.price, days: row.days, accs: row.accs };
}

// Upgrade user plan helper
async function upgradePlan(env, userId, planId, orderId) {
  const plan = await getPlan(env, planId);
  if (!plan) return null;

  const now = new Date();
  const currentUser = await env.DB.prepare('SELECT plan, plan_expires, referred_by FROM users WHERE id = ?').bind(userId).first();
  let startDate = now;
  if (currentUser?.plan_expires) {
    const exp = new Date(currentUser.plan_expires);
    if (exp > now) startDate = exp;
  }
  const expiresAt = new Date(startDate.getTime() + plan.days * 86400000).toISOString().slice(0, 10);

  await env.DB.prepare(
    `UPDATE users SET plan = ?, daily_limit = -1, video_limit = -1, credits = -1, plan_expires = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(planId, expiresAt, userId).run();

  // Record commission if user was referred
  if (currentUser?.referred_by) {
    const affiliate = await env.DB.prepare('SELECT id, commission_rate, is_affiliate FROM users WHERE id = ? AND is_affiliate = 1').bind(currentUser.referred_by).first();
    if (affiliate) {
      const rate = affiliate.commission_rate || 20;
      const commission = Math.round(plan.price * rate / 100);
      await env.DB.prepare(
        "INSERT INTO commissions (affiliate_id, order_id, buyer_id, amount, commission, rate, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))"
      ).bind(affiliate.id, orderId || 0, userId, plan.price, commission, rate).run();
    }
  }

  return expiresAt;
}

// ===== PUBLIC: Web2M Webhook =====
export async function handleWebhook(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ status: false, msg: 'Phương thức không hỗ trợ' }, 405);
  }

  // Verify Bearer token from Web2M
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token || token !== env.WEB2M_TOKEN) {
    console.log(`[Webhook] Auth failed. Got token: "${token?.slice(0,10)}..." Expected: "${env.WEB2M_TOKEN?.slice(0,10)}..."`);
    return jsonResponse({ status: false, msg: 'Không có quyền truy cập' }, 401);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ status: false, msg: 'JSON không hợp lệ' }, 400);
  }

  // Log full webhook payload for debugging
  console.log(`[Webhook] Full payload: ${JSON.stringify(body).slice(0, 2000)}`);

  // Save webhook log to DB for debugging
  try {
    await env.DB.prepare(
      "INSERT INTO webhook_logs (payload, created_at) VALUES (?, datetime('now'))"
    ).bind(JSON.stringify(body).slice(0, 4000)).run();
  } catch (e) { /* table might not exist yet, ignore */ }

  if (!body.status && !body.data) {
    return jsonResponse({ status: true, msg: 'No data' });
  }

  // Web2M can send data as array or single object
  const txList = Array.isArray(body.data) ? body.data : (body.data ? [body.data] : []);
  if (!txList.length) {
    return jsonResponse({ status: true, msg: 'Empty data' });
  }

  console.log(`[Webhook] Processing ${txList.length} transactions`);

  for (const tx of txList) {
    if (tx.type !== 'IN') continue;

    const desc = (tx.description || '').toUpperCase();
    const amount = Number(tx.amount) || 0;
    const txRef = String(tx.transactionID || tx.id || '');

    // Find pending order whose memo_code appears in description
    const pendingOrders = await env.DB.prepare(
      "SELECT * FROM payment_orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 100"
    ).all();

    for (const order of pendingOrders.results) {
      if (desc.includes(order.memo_code.toUpperCase()) && amount >= order.amount) {
        // Match found — upgrade user
        const expiresAt = await upgradePlan(env, order.user_id, order.plan_id, order.id);
        if (expiresAt) {
          await env.DB.prepare(
            `UPDATE payment_orders SET status = 'completed', completed_at = datetime('now'), transaction_ref = ? WHERE id = ?`
          ).bind(txRef, order.id).run();
          console.log(`[Webhook] Order #${order.id} completed for user ${order.user_id}, plan=${order.plan_id}, expires=${expiresAt}`);
        }
        break; // one tx matches one order
      }
    }
  }

  // Web2M requires { status: true } response
  return jsonResponse({ status: true, msg: 'Ok' });
}

// ===== PROTECTED: User payment endpoints =====
export async function handlePayment(request, env, user, path) {
  const userId = user.sub;

  // POST /api/payment/create
  if (path === '/api/payment/create' && request.method === 'POST') {
    const { plan_id } = await request.json();
    const plan = await getPlan(env, plan_id);
    if (!plan) return jsonResponse({ error: 'Gói không hợp lệ' }, 400);

    const code = 'GS' + userId + Date.now().toString(36).toUpperCase();
    const amount = plan.price;

    await env.DB.prepare(
      `INSERT INTO payment_orders (user_id, plan_id, amount, memo_code, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', datetime('now'))`
    ).bind(userId, plan_id, amount, code).run();

    const qrUrl = `https://api.web2m.com/quicklink/ACB/${ACB_ACCOUNT}/${encodeURIComponent(ACB_NAME)}?amount=${amount}&memo=${encodeURIComponent(code)}&is_mask=0&bg=11`;

    return jsonResponse({
      order: { plan_id, plan_name: plan.name, amount, memo_code: code, qr_url: qrUrl, accs: plan.accs, days: plan.days },
      bank: { name: 'ACB', account: ACB_ACCOUNT, holder: ACB_NAME }
    });
  }

  // POST /api/payment/check — just check DB status (webhook updates it)
  if (path === '/api/payment/check' && request.method === 'POST') {
    const { memo_code } = await request.json();
    if (!memo_code) return jsonResponse({ error: 'Thiếu mã giao dịch' }, 400);

    const order = await env.DB.prepare(
      'SELECT * FROM payment_orders WHERE memo_code = ? AND user_id = ?'
    ).bind(memo_code, userId).first();
    if (!order) return jsonResponse({ error: 'Không tìm thấy đơn hàng' }, 404);

    if (order.status === 'completed') {
      const u = await env.DB.prepare('SELECT plan_expires FROM users WHERE id = ?').bind(userId).first();
      return jsonResponse({ status: 'completed', message: 'Thanh toán thành công!', plan_expires: u?.plan_expires || '' });
    }

    return jsonResponse({ status: 'pending', message: 'Đang chờ thanh toán...' });
  }

  // GET /api/payment/history
  if (path === '/api/payment/history' && request.method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT * FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
    ).bind(userId).all();
    return jsonResponse({ orders: rows.results });
  }

  return jsonResponse({ error: 'Không tìm thấy' }, 404);
}
