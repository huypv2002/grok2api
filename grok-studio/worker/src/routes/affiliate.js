import { jsonResponse } from '../utils/response.js';

// Conversion: 100,000₫ commission = 7 days
const POINTS_PER_DAY = Math.round(100000 / 7); // ~14,286₫ per day

export async function handleAffiliate(request, env, user, path) {
  const userId = user.sub;

  // Check if user is affiliate
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

  // POST /api/affiliate/redeem
  if (request.method === 'POST' && path === '/api/affiliate/redeem') {
    const { type, amount } = await request.json();
    if (!type || !['days', 'cash'].includes(type)) return jsonResponse({ error: 'Loại đổi không hợp lệ' }, 400);
    if (!amount || amount <= 0) return jsonResponse({ error: 'Số tiền không hợp lệ' }, 400);

    // Check available balance (pending commissions)
    const pending = await env.DB.prepare(
      "SELECT COALESCE(SUM(commission),0) as t FROM commissions WHERE affiliate_id = ? AND status = 'pending'"
    ).bind(userId).first();

    if (amount > pending.t) return jsonResponse({ error: `Số dư không đủ. Hiện có: ${pending.t.toLocaleString()}₫` }, 400);

    if (type === 'days') {
      // Convert points to days
      const days = Math.floor(amount / POINTS_PER_DAY);
      if (days < 1) return jsonResponse({ error: `Cần tối thiểu ${POINTS_PER_DAY.toLocaleString()}₫ để đổi 1 ngày` }, 400);
      const actualPoints = days * POINTS_PER_DAY;

      // Add days to user's plan
      const now = new Date();
      let startDate = now;
      if (me.plan_expires) {
        const exp = new Date(me.plan_expires);
        if (exp > now) startDate = exp;
      }
      const newExpires = new Date(startDate.getTime() + days * 86400000).toISOString().slice(0, 10);

      // If user is on free plan, set a default paid plan
      const newPlan = me.plan === 'free' ? 'week3' : me.plan;

      // Deduct from pending commissions (mark oldest pending as 'paid' until amount covered)
      await _deductCommissions(env, userId, actualPoints);

      // Update user plan
      await env.DB.prepare(
        `UPDATE users SET plan = ?, plan_expires = ?, daily_limit = -1, video_limit = -1, credits = -1, updated_at = datetime('now') WHERE id = ?`
      ).bind(newPlan, newExpires, userId).run();

      // Record redemption
      await env.DB.prepare(
        "INSERT INTO redemptions (affiliate_id, type, amount, points_used, days_added, status, processed_at) VALUES (?, 'days', ?, ?, ?, 'approved', datetime('now'))"
      ).bind(userId, actualPoints, actualPoints, days).run();

      return jsonResponse({ message: `Đã đổi ${actualPoints.toLocaleString()}₫ → ${days} ngày. Hết hạn: ${newExpires}`, days, new_expires: newExpires });
    }

    if (type === 'cash') {
      // Cash withdrawal request — needs admin approval
      if (amount < 50000) return jsonResponse({ error: 'Rút tiền tối thiểu 50,000₫' }, 400);

      await env.DB.prepare(
        "INSERT INTO redemptions (affiliate_id, type, amount, points_used, status) VALUES (?, 'cash', ?, ?, 'pending')"
      ).bind(userId, amount, amount).run();

      return jsonResponse({ message: `Yêu cầu rút ${amount.toLocaleString()}₫ đã được gửi. Chờ admin duyệt.` });
    }

    return jsonResponse({ error: 'Invalid type' }, 400);
  }

  return jsonResponse({ error: 'Not found' }, 404);
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
