import { jsonResponse } from '../utils/response.js';

// Conversion: 100,000₫ commission = 7 days
const POINTS_PER_DAY = Math.round(100000 / 7); // ~14,286₫ per day

export async function handleAffiliate(request, env, user, path) {
  const userId = user.sub;

  // === PUBLIC ENDPOINTS (any logged-in user) ===

  // GET /api/affiliate/status — check CTV status (is_affiliate, pending request, etc.)
  if (request.method === 'GET' && path === '/api/affiliate/status') {
    const me = await env.DB.prepare('SELECT id, is_affiliate, ref_code, commission_rate FROM users WHERE id = ?').bind(userId).first();
    if (!me) return jsonResponse({ error: 'Không tìm thấy người dùng' }, 404);
    if (me.is_affiliate) {
      return jsonResponse({ status: 'active', ref_code: me.ref_code, commission_rate: me.commission_rate });
    }
    // Check for pending request
    const pending = await env.DB.prepare(
      "SELECT id, ref_code, note, status, reject_reason, created_at FROM affiliate_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
    ).bind(userId).first();
    if (pending) {
      return jsonResponse({ status: pending.status, request: pending });
    }
    return jsonResponse({ status: 'none' });
  }

  // POST /api/affiliate/apply — submit CTV application
  if (request.method === 'POST' && path === '/api/affiliate/apply') {
    const me = await env.DB.prepare('SELECT id, is_affiliate FROM users WHERE id = ?').bind(userId).first();
    if (!me) return jsonResponse({ error: 'Không tìm thấy người dùng' }, 404);
    if (me.is_affiliate) return jsonResponse({ error: 'Bạn đã là CTV rồi' }, 400);

    // Check for existing pending request
    const existing = await env.DB.prepare(
      "SELECT id FROM affiliate_requests WHERE user_id = ? AND status = 'pending'"
    ).bind(userId).first();
    if (existing) return jsonResponse({ error: 'Bạn đã có đơn đang chờ duyệt' }, 400);

    const body = await request.json();
    const { ref_code, note } = body;
    if (!ref_code || ref_code.length < 3 || ref_code.length > 20) {
      return jsonResponse({ error: 'Mã CTV phải từ 3-20 ký tự' }, 400);
    }
    // Only allow alphanumeric, dash, underscore
    if (!/^[a-zA-Z0-9_\-]+$/.test(ref_code)) {
      return jsonResponse({ error: 'Mã CTV chỉ chấp nhận chữ, số, dấu gạch ngang và gạch dưới' }, 400);
    }

    // Check ref_code uniqueness (in users and pending requests)
    const codeInUse = await env.DB.prepare('SELECT id FROM users WHERE ref_code = ?').bind(ref_code).first();
    if (codeInUse) return jsonResponse({ error: 'Mã CTV này đã được sử dụng' }, 409);
    const codeInReq = await env.DB.prepare(
      "SELECT id FROM affiliate_requests WHERE ref_code = ? AND status = 'pending'"
    ).bind(ref_code).first();
    if (codeInReq) return jsonResponse({ error: 'Mã CTV này đang chờ duyệt bởi người khác' }, 409);

    await env.DB.prepare(
      "INSERT INTO affiliate_requests (user_id, ref_code, note) VALUES (?, ?, ?)"
    ).bind(userId, ref_code, note || '').run();

    return jsonResponse({ message: 'Đã gửi đơn đăng ký CTV. Chờ admin duyệt.' });
  }

  // === CTV-ONLY ENDPOINTS (require is_affiliate) ===
  const me = await env.DB.prepare('SELECT id, is_affiliate, ref_code, commission_rate, plan, plan_expires FROM users WHERE id = ?').bind(userId).first();
  if (!me || !me.is_affiliate) return jsonResponse({ error: 'Bạn không phải CTV' }, 403);

  // GET /api/affiliate/dashboard
  if (request.method === 'GET' && path === '/api/affiliate/dashboard') {
    const totalComm = await env.DB.prepare(
      "SELECT COALESCE(SUM(commission),0) as t FROM commissions WHERE affiliate_id = ?"
    ).bind(userId).first();
    const pendingComm = await env.DB.prepare(
      "SELECT COALESCE(SUM(commission),0) as t FROM commissions WHERE affiliate_id = ? AND status = 'pending'"
    ).bind(userId).first();
    const paidComm = await env.DB.prepare(
      "SELECT COALESCE(SUM(commission),0) as t FROM commissions WHERE affiliate_id = ? AND status = 'paid'"
    ).bind(userId).first();
    const redeemedComm = await env.DB.prepare(
      "SELECT COALESCE(SUM(points_used),0) as t FROM redemptions WHERE affiliate_id = ? AND status = 'approved'"
    ).bind(userId).first();
    const referralCount = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM users WHERE referred_by = ?"
    ).bind(userId).first();
    const referralBuyers = await env.DB.prepare(
      "SELECT COUNT(DISTINCT buyer_id) as cnt FROM commissions WHERE affiliate_id = ?"
    ).bind(userId).first();

    // Available balance = total pending (not yet paid/redeemed)
    const availableBalance = pendingComm.t;

    // Recent commissions
    const recentComms = await env.DB.prepare(
      `SELECT c.*, b.email as buyer_email FROM commissions c
       JOIN users b ON c.buyer_id = b.id
       WHERE c.affiliate_id = ? ORDER BY c.created_at DESC LIMIT 20`
    ).bind(userId).all();

    // Redemption history
    const redemptions = await env.DB.prepare(
      'SELECT * FROM redemptions WHERE affiliate_id = ? ORDER BY created_at DESC LIMIT 20'
    ).bind(userId).all();

    // Referral list
    const referrals = await env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.plan, u.created_at,
        (SELECT COALESCE(SUM(c.commission),0) FROM commissions c WHERE c.buyer_id = u.id AND c.affiliate_id = ?) as earned
       FROM users u WHERE u.referred_by = ? ORDER BY u.created_at DESC LIMIT 50`
    ).bind(userId, userId).all();

    return jsonResponse({
      ref_code: me.ref_code,
      commission_rate: me.commission_rate,
      link: `https://grok.liveyt.pro/?ref=${me.ref_code}`,
      stats: {
        totalCommission: totalComm.t,
        pendingCommission: pendingComm.t,
        paidCommission: paidComm.t,
        redeemedCommission: redeemedComm.t,
        availableBalance,
        referralCount: referralCount.cnt,
        referralBuyers: referralBuyers.cnt,
        pointsPerDay: POINTS_PER_DAY,
      },
      commissions: recentComms.results,
      redemptions: redemptions.results,
      referrals: referrals.results,
    });
  }

  // POST /api/affiliate/redeem — chỉ rút tiền, không đổi ngày
  if (request.method === 'POST' && path === '/api/affiliate/redeem') {
    const { type, amount } = await request.json();
    // Chỉ cho phép rút tiền
    if (type !== 'cash') return jsonResponse({ error: 'Chỉ hỗ trợ rút tiền mặt' }, 400);
    if (!amount || amount <= 0) return jsonResponse({ error: 'Số tiền không hợp lệ' }, 400);
    if (amount < 50000) return jsonResponse({ error: 'Rút tiền tối thiểu 50,000₫' }, 400);

    // Check available balance (pending commissions)
    const pending = await env.DB.prepare(
      "SELECT COALESCE(SUM(commission),0) as t FROM commissions WHERE affiliate_id = ? AND status = 'pending'"
    ).bind(userId).first();

    if (amount > pending.t) return jsonResponse({ error: `Số dư không đủ. Hiện có: ${pending.t.toLocaleString()}₫` }, 400);

    // Cash withdrawal request — needs admin approval
    await env.DB.prepare(
      "INSERT INTO redemptions (affiliate_id, type, amount, points_used, status) VALUES (?, 'cash', ?, ?, 'pending')"
    ).bind(userId, amount, amount).run();

    return jsonResponse({ message: `Yêu cầu rút ${amount.toLocaleString()}₫ đã được gửi. Chờ admin duyệt.` });
  }

  return jsonResponse({ error: 'Không tìm thấy' }, 404);
}

// Deduct commission points by marking oldest pending commissions as 'paid'
async function _deductCommissions(env, affiliateId, amount) {
  let remaining = amount;
  const pending = await env.DB.prepare(
    "SELECT id, commission FROM commissions WHERE affiliate_id = ? AND status = 'pending' ORDER BY created_at ASC"
  ).bind(affiliateId).all();

  for (const c of pending.results) {
    if (remaining <= 0) break;
    if (c.commission <= remaining) {
      // Full deduction
      await env.DB.prepare("UPDATE commissions SET status = 'paid', paid_at = datetime('now') WHERE id = ?").bind(c.id).run();
      remaining -= c.commission;
    } else {
      // Partial: reduce this commission's value and mark the used portion
      // Keep the record pending with reduced amount (leftover)
      const leftover = c.commission - remaining;
      await env.DB.prepare("UPDATE commissions SET commission = ? WHERE id = ?").bind(leftover, c.id).run();
      remaining = 0;
    }
  }
}
