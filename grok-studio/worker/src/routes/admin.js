import { jsonResponse } from '../utils/response.js';
import { hashPassword } from '../utils/hash.js';

function requireAdmin(user) {
  if (user.role !== 'admin' && user.role !== 'superadmin') return jsonResponse({ error: 'Cần quyền admin' }, 403);
  return null;
}

function requireSuperAdmin(user) {
  if (user.role !== 'superadmin') return jsonResponse({ error: 'Cần quyền super admin' }, 403);
  return null;
}

export async function handleAdmin(request, env, user, path) {
  const denied = requireAdmin(user);
  if (denied) return denied;

  // ===== USERS =====
  // GET /api/admin/users
  if (request.method === 'GET' && path === '/api/admin/users') {
    const url = new URL(request.url);
    const search = url.searchParams.get('search') || '';
    const plan = url.searchParams.get('plan') || '';
    const role = url.searchParams.get('role') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let query = 'SELECT id, email, name, plan, role, credits, daily_limit, video_limit, plan_expires, created_at, updated_at FROM users WHERE 1=1';
    const params = [];
    if (search) { query += ' AND (email LIKE ? OR name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (plan) { query += ' AND plan = ?'; params.push(plan); }
    if (role) { query += ' AND role = ?'; params.push(role); }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await env.DB.prepare(query).bind(...params).all();
    const total = await env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first();
    return jsonResponse({ users: rows.results, total: total.cnt });
  }

  // PUT /api/admin/users/:id - update user
  const userUpdateMatch = path.match(/^\/api\/admin\/users\/(\d+)$/);
  if (request.method === 'PUT' && userUpdateMatch) {
    const id = parseInt(userUpdateMatch[1]);
    const body = await request.json();
    const sets = [];
    const params = [];

    if (body.plan !== undefined) { sets.push('plan = ?'); params.push(body.plan); }
    if (body.role !== undefined) { sets.push('role = ?'); params.push(body.role); }
    if (body.credits !== undefined) { sets.push('credits = ?'); params.push(body.credits); }
    if (body.name !== undefined) { sets.push('name = ?'); params.push(body.name); }
    if (body.daily_limit !== undefined) { sets.push('daily_limit = ?'); params.push(body.daily_limit); }
    if (body.video_limit !== undefined) { sets.push('video_limit = ?'); params.push(body.video_limit); }
    if (body.plan_expires !== undefined) { sets.push('plan_expires = ?'); params.push(body.plan_expires || null); }
    if (body.password) { sets.push('password_hash = ?'); params.push(await hashPassword(body.password)); }

    if (sets.length === 0) return jsonResponse({ error: 'Không có trường nào để cập nhật' }, 400);
    sets.push("updated_at = datetime('now')");
    params.push(id);

    await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
    const updated = await env.DB.prepare('SELECT id,email,name,plan,role,credits,daily_limit,video_limit,plan_expires FROM users WHERE id = ?').bind(id).first();
    return jsonResponse({ user: updated });
  }

  // DELETE /api/admin/users/:id
  if (request.method === 'DELETE' && userUpdateMatch) {
    const id = parseInt(userUpdateMatch[1]);
    if (id === user.sub) return jsonResponse({ error: 'Không thể xóa chính mình' }, 400);
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return jsonResponse({ message: 'Đã xóa người dùng' });
  }

  // ===== ALL ACCOUNTS (admin sees all) =====
  // GET /api/admin/accounts
  if (request.method === 'GET' && path === '/api/admin/accounts') {
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    const status = url.searchParams.get('status');

    let query = `SELECT ga.id, ga.user_id, ga.label, substr(ga.sso_token,1,20) || '...' as token_preview, ga.sso_token,
      ga.status, ga.last_used, ga.created_at, u.email as user_email
      FROM grok_accounts ga JOIN users u ON ga.user_id = u.id WHERE 1=1`;
    const params = [];
    if (userId) { query += ' AND ga.user_id = ?'; params.push(parseInt(userId)); }
    if (status) { query += ' AND ga.status = ?'; params.push(status); }
    query += ' ORDER BY ga.created_at DESC';

    const rows = await env.DB.prepare(query).bind(...params).all();
    return jsonResponse({ accounts: rows.results });
  }

  // PUT /api/admin/accounts/:id - update status
  const accUpdateMatch = path.match(/^\/api\/admin\/accounts\/(\d+)$/);
  if (request.method === 'PUT' && accUpdateMatch) {
    const id = parseInt(accUpdateMatch[1]);
    const body = await request.json();
    if (body.status) {
      await env.DB.prepare('UPDATE grok_accounts SET status = ? WHERE id = ?').bind(body.status, id).run();
    }
    if (body.label !== undefined) {
      await env.DB.prepare('UPDATE grok_accounts SET label = ? WHERE id = ?').bind(body.label, id).run();
    }
    return jsonResponse({ message: 'Đã cập nhật' });
  }

  // DELETE /api/admin/accounts/:id
  if (request.method === 'DELETE' && accUpdateMatch) {
    const id = parseInt(accUpdateMatch[1]);
    await env.DB.prepare('DELETE FROM grok_accounts WHERE id = ?').bind(id).run();
    return jsonResponse({ message: 'Đã xóa tài khoản' });
  }

  // ===== ALL HISTORY (admin sees all) =====
  // GET /api/admin/history
  if (request.method === 'GET' && path === '/api/admin/history') {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const userId = url.searchParams.get('user_id');
    const status = url.searchParams.get('status');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Chỉ hiển thị 2 ngày gần nhất
    let where = "WHERE h.created_at >= datetime('now', '-2 days')";
    const params = [];
    if (type) { where += ' AND h.type = ?'; params.push(type); }
    if (userId) { where += ' AND h.user_id = ?'; params.push(parseInt(userId)); }
    if (status) { where += ' AND h.status = ?'; params.push(status); }

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM history h ${where}`
    ).bind(...params).first();

    const rows = await env.DB.prepare(
      `SELECT h.*, u.email as user_email FROM history h JOIN users u ON h.user_id = u.id ${where} ORDER BY h.created_at DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();

    return jsonResponse({ history: rows.results, total: countRow.cnt, limit, offset });
  }

  // DELETE /api/admin/history/cleanup — xóa history cũ hơn 2 ngày
  if (request.method === 'DELETE' && path === '/api/admin/history/cleanup') {
    const result = await env.DB.prepare(
      "DELETE FROM history WHERE created_at < datetime('now', '-2 days')"
    ).run();
    return jsonResponse({ message: `Đã xóa ${result.meta.changes} bản ghi cũ`, deleted: result.meta.changes });
  }

  // PUT /api/admin/history/:id — update a history record (status, output_url)
  const histUpdateMatch = path.match(/^\/api\/admin\/history\/(\d+)$/);
  if (request.method === 'PUT' && histUpdateMatch) {
    const id = parseInt(histUpdateMatch[1]);
    const body = await request.json();
    const sets = [];
    const params = [];
    if (body.status) { sets.push('status = ?'); params.push(body.status); }
    if (body.output_url) { sets.push('output_url = ?'); params.push(body.output_url); }
    if (body.status === 'completed' && !body.completed_at) { sets.push("completed_at = datetime('now')"); }
    if (!sets.length) return jsonResponse({ error: 'Không có gì để cập nhật' }, 400);
    params.push(id);
    await env.DB.prepare(`UPDATE history SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
    return jsonResponse({ message: 'Đã cập nhật', id });
  }

  // ===== STATS =====
  // GET /api/admin/stats
  if (request.method === 'GET' && path === '/api/admin/stats') {
    const users = await env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first();
    const accounts = await env.DB.prepare('SELECT COUNT(*) as cnt FROM grok_accounts').first();
    const activeAccounts = await env.DB.prepare("SELECT COUNT(*) as cnt FROM grok_accounts WHERE status = 'active'").first();
    const totalGens = await env.DB.prepare('SELECT COUNT(*) as cnt FROM history').first();
    const completedGens = await env.DB.prepare("SELECT COUNT(*) as cnt FROM history WHERE status = 'completed'").first();
    const failedGens = await env.DB.prepare("SELECT COUNT(*) as cnt FROM history WHERE status = 'failed'").first();
    const todayGens = await env.DB.prepare("SELECT COUNT(*) as cnt FROM history WHERE created_at >= date('now')").first();
    const planDist = await env.DB.prepare('SELECT plan, COUNT(*) as cnt FROM users GROUP BY plan').all();

    return jsonResponse({
      stats: {
        totalUsers: users.cnt,
        totalAccounts: accounts.cnt,
        activeAccounts: activeAccounts.cnt,
        totalGenerations: totalGens.cnt,
        completedGenerations: completedGens.cnt,
        failedGenerations: failedGens.cnt,
        todayGenerations: todayGens.cnt,
        planDistribution: planDist.results,
      }
    });
  }

  // ===== PLANS MANAGEMENT =====
  // PUT /api/admin/plans/:id (old plans table)
  const planMatch = path.match(/^\/api\/admin\/plans\/(\w+)$/);
  if (request.method === 'PUT' && planMatch) {
    const id = planMatch[1];
    const body = await request.json();
    const sets = [];
    const params = [];
    if (body.name !== undefined) { sets.push('name = ?'); params.push(body.name); }
    if (body.price !== undefined) { sets.push('price = ?'); params.push(body.price); }
    if (body.credits_per_month !== undefined) { sets.push('credits_per_month = ?'); params.push(body.credits_per_month); }
    if (body.max_accounts !== undefined) { sets.push('max_accounts = ?'); params.push(body.max_accounts); }
    if (body.daily_limit !== undefined) { sets.push('daily_limit = ?'); params.push(body.daily_limit); }
    if (body.video_limit !== undefined) { sets.push('video_limit = ?'); params.push(body.video_limit); }
    if (body.features !== undefined) { sets.push('features = ?'); params.push(JSON.stringify(body.features)); }
    if (sets.length === 0) return jsonResponse({ error: 'Không có trường nào' }, 400);
    params.push(id);
    await env.DB.prepare(`UPDATE plans SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
    return jsonResponse({ message: 'Đã cập nhật gói' });
  }

  // ===== SERVICE PLANS (pricing plans) =====
  // GET /api/admin/service-plans
  if (request.method === 'GET' && path === '/api/admin/service-plans') {
    const rows = await env.DB.prepare('SELECT * FROM service_plans ORDER BY sort_order ASC').all();
    return jsonResponse({ plans: rows.results });
  }

  // PUT /api/admin/service-plans/:id
  const spMatch = path.match(/^\/api\/admin\/service-plans\/([\w-]+)$/);
  if (request.method === 'PUT' && spMatch) {
    const id = spMatch[1];
    const body = await request.json();
    const sets = [];
    const params = [];
    if (body.name !== undefined) { sets.push('name = ?'); params.push(body.name); }
    if (body.tier !== undefined) { sets.push('tier = ?'); params.push(body.tier); }
    if (body.duration !== undefined) { sets.push('duration = ?'); params.push(body.duration); }
    if (body.price !== undefined) { sets.push('price = ?'); params.push(body.price); }
    if (body.days !== undefined) { sets.push('days = ?'); params.push(body.days); }
    if (body.accs !== undefined) { sets.push('accs = ?'); params.push(body.accs); }
    if (body.save_text !== undefined) { sets.push('save_text = ?'); params.push(body.save_text); }
    if (body.popular !== undefined) { sets.push('popular = ?'); params.push(body.popular ? 1 : 0); }
    if (body.sort_order !== undefined) { sets.push('sort_order = ?'); params.push(body.sort_order); }
    if (body.active !== undefined) { sets.push('active = ?'); params.push(body.active ? 1 : 0); }
    if (sets.length === 0) return jsonResponse({ error: 'Không có trường nào' }, 400);
    params.push(id);
    await env.DB.prepare(`UPDATE service_plans SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
    return jsonResponse({ message: 'Đã cập nhật gói dịch vụ' });
  }

  // POST /api/admin/service-plans — create new plan
  if (request.method === 'POST' && path === '/api/admin/service-plans') {
    const body = await request.json();
    const { id, name, tier, duration, price, days, accs, save_text, popular } = body;
    if (!id || !name) return jsonResponse({ error: 'Thiếu id và tên' }, 400);
    const existing = await env.DB.prepare('SELECT id FROM service_plans WHERE id = ?').bind(id).first();
    if (existing) return jsonResponse({ error: 'ID gói đã tồn tại' }, 409);
    const maxSort = await env.DB.prepare('SELECT MAX(sort_order) as m FROM service_plans').first();
    await env.DB.prepare(
      'INSERT INTO service_plans (id, name, tier, duration, price, days, accs, save_text, popular, sort_order, active) VALUES (?,?,?,?,?,?,?,?,?,?,1)'
    ).bind(id, name, tier || 'Starter', duration || 'month', price || 0, days || 30, accs || 1, save_text || '', popular ? 1 : 0, (maxSort?.m || 0) + 1).run();
    return jsonResponse({ message: 'Đã tạo gói' });
  }

  // DELETE /api/admin/service-plans/:id
  if (request.method === 'DELETE' && spMatch) {
    const id = spMatch[1];
    await env.DB.prepare('DELETE FROM service_plans WHERE id = ?').bind(id).run();
    return jsonResponse({ message: 'Đã xóa gói' });
  }

  // ===== CREATE USER =====
  // POST /api/admin/users
  if (request.method === 'POST' && path === '/api/admin/users') {
    const body = await request.json();
    const { email, password, name, plan, role, credits, daily_limit, video_limit, plan_expires } = body;
    if (!email || !password) return jsonResponse({ error: 'Vui lòng nhập email và mật khẩu' }, 400);

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return jsonResponse({ error: 'Email đã tồn tại' }, 409);

    const hash = await hashPassword(password);
    const result = await env.DB.prepare(
      'INSERT INTO users (email, password_hash, name, plan, role, credits, daily_limit, video_limit, plan_expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(email, hash, name || '', plan || 'free', role || 'user', credits ?? 10, daily_limit ?? -1, video_limit ?? -1, plan_expires || null).run();

    return jsonResponse({ id: result.meta.last_row_id, message: 'Đã tạo người dùng' });
  }

  // ===== BULK CREATE USERS =====
  // POST /api/admin/users/bulk
  if (request.method === 'POST' && path === '/api/admin/users/bulk') {
    const body = await request.json();
    const { count, prefix, password, plan, role, credits, daily_limit, video_limit, plan_expires } = body;
    if (!count || count < 1 || count > 100) return jsonResponse({ error: 'Số lượng phải từ 1-100' }, 400);
    if (!password) return jsonResponse({ error: 'Thiếu mật khẩu' }, 400);

    const hash = await hashPassword(password);
    const created = [];
    const failed = [];

    for (let i = 1; i <= count; i++) {
      const email = `${prefix || 'user'}${String(i).padStart(3, '0')}@grok.studio`;
      try {
        const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
        if (existing) { failed.push({ email, reason: 'exists' }); continue; }
        const result = await env.DB.prepare(
          'INSERT INTO users (email, password_hash, name, plan, role, credits, daily_limit, video_limit, plan_expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(email, hash, '', plan || 'free', role || 'user', credits ?? 10, daily_limit ?? -1, video_limit ?? -1, plan_expires || null).run();
        created.push({ id: result.meta.last_row_id, email });
      } catch (e) {
        failed.push({ email, reason: e.message });
      }
    }

    return jsonResponse({ created, failed, total: created.length });
  }

  // ===== USER USAGE STATS =====
  // GET /api/admin/users/:id/usage
  const usageMatch = path.match(/^\/api\/admin\/users\/(\d+)\/usage$/);
  if (request.method === 'GET' && usageMatch) {
    const uid = parseInt(usageMatch[1]);
    const today = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM history WHERE user_id = ? AND created_at >= date('now')"
    ).bind(uid).first();
    const todayVideos = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM history WHERE user_id = ? AND created_at >= date('now') AND type IN ('text2video','image2video','extend_video')"
    ).bind(uid).first();
    const total = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM history WHERE user_id = ?'
    ).bind(uid).first();
    return jsonResponse({ daily: today.cnt, dailyVideos: todayVideos.cnt, total: total.cnt });
  }

  // ===== PAYMENT ORDERS (Admin) =====
  // GET /api/admin/payments
  if (request.method === 'GET' && path === '/api/admin/payments') {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    const userId = url.searchParams.get('user_id') || '';
    const from = url.searchParams.get('from') || '';
    const to = url.searchParams.get('to') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

    let query = `SELECT po.*, u.email as user_email, u.name as user_name FROM payment_orders po JOIN users u ON po.user_id = u.id WHERE 1=1`;
    const params = [];
    if (status) { query += ' AND po.status = ?'; params.push(status); }
    if (userId) { query += ' AND po.user_id = ?'; params.push(parseInt(userId)); }
    if (from) { query += ' AND po.created_at >= ?'; params.push(from); }
    if (to) { query += ' AND po.created_at <= ? || " 23:59:59"'; params.push(to); }
    query += ' ORDER BY po.created_at DESC LIMIT ?';
    params.push(limit);

    const rows = await env.DB.prepare(query).bind(...params).all();

    // Stats
    const totalOrders = await env.DB.prepare('SELECT COUNT(*) as cnt FROM payment_orders').first();
    const completedOrders = await env.DB.prepare("SELECT COUNT(*) as cnt FROM payment_orders WHERE status = 'completed'").first();
    const pendingOrders = await env.DB.prepare("SELECT COUNT(*) as cnt FROM payment_orders WHERE status = 'pending'").first();
    const totalRevenue = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) as total FROM payment_orders WHERE status = 'completed'").first();
    const todayRevenue = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) as total FROM payment_orders WHERE status = 'completed' AND completed_at >= date('now')").first();

    return jsonResponse({
      orders: rows.results,
      stats: {
        total: totalOrders.cnt,
        completed: completedOrders.cnt,
        pending: pendingOrders.cnt,
        totalRevenue: totalRevenue.total,
        todayRevenue: todayRevenue.total
      }
    });
  }

  // PUT /api/admin/payments/:id — manually update order status
  const payMatch = path.match(/^\/api\/admin\/payments\/(\d+)$/);
  if (request.method === 'PUT' && payMatch) {
    const id = parseInt(payMatch[1]);
    const body = await request.json();
    const sets = [];
    const params = [];
    if (body.status) { sets.push('status = ?'); params.push(body.status); }
    if (body.status === 'completed') { sets.push("completed_at = datetime('now')"); }
    if (body.transaction_ref !== undefined) { sets.push('transaction_ref = ?'); params.push(body.transaction_ref); }
    if (!sets.length) return jsonResponse({ error: 'Không có trường nào' }, 400);
    params.push(id);
    await env.DB.prepare(`UPDATE payment_orders SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

    // If marking as completed, also upgrade the user
    if (body.status === 'completed') {
      const order = await env.DB.prepare('SELECT * FROM payment_orders WHERE id = ?').bind(id).first();
      if (order) {
        // Read plan from DB
        const planRow = await env.DB.prepare('SELECT * FROM service_plans WHERE id = ?').bind(order.plan_id).first();
        const days = planRow ? planRow.days : 30;
        const price = planRow ? planRow.price : (order.amount || 0);
        const now = new Date();
        const currentUser = await env.DB.prepare('SELECT plan_expires, referred_by FROM users WHERE id = ?').bind(order.user_id).first();
        let startDate = now;
        if (currentUser?.plan_expires) {
          const exp = new Date(currentUser.plan_expires);
          if (exp > now) startDate = exp;
        }
        const expiresAt = new Date(startDate.getTime() + days * 86400000).toISOString().slice(0, 10);
        await env.DB.prepare(
          `UPDATE users SET plan = ?, daily_limit = -1, video_limit = -1, credits = -1, plan_expires = ?, updated_at = datetime('now') WHERE id = ?`
        ).bind(order.plan_id, expiresAt, order.user_id).run();

        // Record commission if user was referred
        if (currentUser?.referred_by) {
          const affiliate = await env.DB.prepare('SELECT id, commission_rate, is_affiliate FROM users WHERE id = ? AND is_affiliate = 1').bind(currentUser.referred_by).first();
          if (affiliate) {
            const rate = affiliate.commission_rate || 20;
            const commission = Math.round(price * rate / 100);
            if (commission > 0) {
              await env.DB.prepare(
                "INSERT INTO commissions (affiliate_id, order_id, buyer_id, amount, commission, rate, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))"
              ).bind(affiliate.id, order.id, order.user_id, price, commission, rate).run();
            }
          }
        }
      }
    }

    return jsonResponse({ message: 'Đã cập nhật' });
  }

  // DELETE /api/admin/payments/:id (superadmin only)
  if (request.method === 'DELETE' && payMatch) {
    const denied = requireSuperAdmin(user);
    if (denied) return denied;
    const id = parseInt(payMatch[1]);
    await env.DB.prepare('DELETE FROM payment_orders WHERE id = ?').bind(id).run();
    return jsonResponse({ message: 'Đã xóa' });
  }

  // ===== AFFILIATE / CTV MANAGEMENT (admin + superadmin) =====

  // GET /api/admin/affiliate-requests — list pending CTV applications
  if (request.method === 'GET' && path === '/api/admin/affiliate-requests') {
    const denied2 = requireAdmin(user);
    if (denied2) return denied2;
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    let query = `SELECT r.*, u.email, u.name, u.plan FROM affiliate_requests r JOIN users u ON r.user_id = u.id WHERE 1=1`;
    const params = [];
    if (status) { query += ' AND r.status = ?'; params.push(status); }
    query += ' ORDER BY r.created_at DESC LIMIT 200';
    const rows = await env.DB.prepare(query).bind(...params).all();
    const pendingCount = await env.DB.prepare("SELECT COUNT(*) as cnt FROM affiliate_requests WHERE status = 'pending'").first();
    return jsonResponse({ requests: rows.results, pendingCount: pendingCount?.cnt || 0 });
  }

  // PUT /api/admin/affiliate-requests/:id — approve or reject
  const affReqMatch = path.match(/^\/api\/admin\/affiliate-requests\/(\d+)$/);
  if (request.method === 'PUT' && affReqMatch) {
    const denied2 = requireAdmin(user);
    if (denied2) return denied2;
    const id = parseInt(affReqMatch[1]);
    const body = await request.json();
    if (!['approved', 'rejected'].includes(body.status)) return jsonResponse({ error: 'Status phải là approved hoặc rejected' }, 400);

    const req = await env.DB.prepare('SELECT * FROM affiliate_requests WHERE id = ?').bind(id).first();
    if (!req) return jsonResponse({ error: 'Không tìm thấy đơn' }, 404);
    if (req.status !== 'pending') return jsonResponse({ error: 'Đơn đã được xử lý' }, 400);

    if (body.status === 'approved') {
      // Check ref_code still unique
      const codeInUse = await env.DB.prepare('SELECT id FROM users WHERE ref_code = ?').bind(req.ref_code).first();
      if (codeInUse) return jsonResponse({ error: 'Mã CTV đã bị trùng, yêu cầu user đổi mã khác' }, 409);

      const rate = body.commission_rate || 5; // default 5% for self-registered
      // Set user as affiliate
      await env.DB.prepare(
        "UPDATE users SET is_affiliate = 1, ref_code = ?, commission_rate = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(req.ref_code, rate, req.user_id).run();
    }

    await env.DB.prepare(
      "UPDATE affiliate_requests SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
    ).bind(body.status, body.reject_reason || null, user.sub, id).run();

    return jsonResponse({ message: body.status === 'approved' ? 'Đã duyệt CTV' : 'Đã từ chối' });
  }

  // GET /api/admin/affiliates — list all CTVs
  if (request.method === 'GET' && path === '/api/admin/affiliates') {
    const denied2 = requireAdmin(user);
    if (denied2) return denied2;

    const rows = await env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.ref_code, u.commission_rate, u.is_affiliate, u.created_at,
        (SELECT COUNT(*) FROM users r WHERE r.referred_by = u.id) as referral_count,
        (SELECT COALESCE(SUM(c.commission),0) FROM commissions c WHERE c.affiliate_id = u.id) as total_commission,
        (SELECT COALESCE(SUM(c.commission),0) FROM commissions c WHERE c.affiliate_id = u.id AND c.status = 'pending') as pending_commission,
        (SELECT COALESCE(SUM(c.commission),0) FROM commissions c WHERE c.affiliate_id = u.id AND c.status = 'paid') as paid_commission
       FROM users u WHERE u.is_affiliate = 1 ORDER BY u.created_at DESC`
    ).all();

    // Global stats
    const totalAff = rows.results.length;
    const totalComm = await env.DB.prepare("SELECT COALESCE(SUM(commission),0) as t FROM commissions").first();
    const pendingComm = await env.DB.prepare("SELECT COALESCE(SUM(commission),0) as t FROM commissions WHERE status = 'pending'").first();
    const paidComm = await env.DB.prepare("SELECT COALESCE(SUM(commission),0) as t FROM commissions WHERE status = 'paid'").first();
    const totalRefs = await env.DB.prepare("SELECT COUNT(*) as cnt FROM users WHERE referred_by IS NOT NULL").first();

    return jsonResponse({
      affiliates: rows.results,
      stats: { totalAffiliates: totalAff, totalCommission: totalComm.t, pendingCommission: pendingComm.t, paidCommission: paidComm.t, totalReferrals: totalRefs.cnt }
    });
  }

  // POST /api/admin/affiliates — add CTV (set user as affiliate)
  if (request.method === 'POST' && path === '/api/admin/affiliates') {
    const denied2 = requireAdmin(user);
    if (denied2) return denied2;
    const body = await request.json();
    const { user_id, ref_code, commission_rate } = body;
    if (!user_id) return jsonResponse({ error: 'Thiếu user_id' }, 400);

    const target = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(user_id).first();
    if (!target) return jsonResponse({ error: 'Không tìm thấy người dùng' }, 404);

    // Generate ref_code if not provided
    const code = ref_code || ('CTV' + target.id + Math.random().toString(36).slice(2, 6).toUpperCase());
    const rate = commission_rate || 5;

    // Check ref_code uniqueness
    const existing = await env.DB.prepare('SELECT id FROM users WHERE ref_code = ? AND id != ?').bind(code, user_id).first();
    if (existing) return jsonResponse({ error: 'Mã giới thiệu đã tồn tại' }, 409);

    await env.DB.prepare(
      "UPDATE users SET is_affiliate = 1, ref_code = ?, commission_rate = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(code, rate, user_id).run();

    return jsonResponse({ message: 'Đã thêm CTV', ref_code: code });
  }

  // PUT /api/admin/affiliates/:id — update CTV
  const affMatch = path.match(/^\/api\/admin\/affiliates\/(\d+)$/);
  if (request.method === 'PUT' && affMatch) {
    const denied2 = requireAdmin(user);
    if (denied2) return denied2;
    const id = parseInt(affMatch[1]);
    const body = await request.json();
    const sets = [];
    const params = [];
    if (body.ref_code !== undefined) { sets.push('ref_code = ?'); params.push(body.ref_code); }
    if (body.commission_rate !== undefined) { sets.push('commission_rate = ?'); params.push(body.commission_rate); }
    if (body.is_affiliate !== undefined) { sets.push('is_affiliate = ?'); params.push(body.is_affiliate ? 1 : 0); }
    if (!sets.length) return jsonResponse({ error: 'Không có trường nào' }, 400);
    sets.push("updated_at = datetime('now')");
    params.push(id);
    await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
    return jsonResponse({ message: 'Đã cập nhật CTV' });
  }

  // DELETE /api/admin/affiliates/:id — remove CTV status
  if (request.method === 'DELETE' && affMatch) {
    const denied2 = requireAdmin(user);
    if (denied2) return denied2;
    const id = parseInt(affMatch[1]);
    await env.DB.prepare("UPDATE users SET is_affiliate = 0, ref_code = NULL, updated_at = datetime('now') WHERE id = ?").bind(id).run();
    return jsonResponse({ message: 'Đã xóa CTV' });
  }

  // GET /api/admin/commissions — list all commissions
  if (request.method === 'GET' && path === '/api/admin/commissions') {
    const denied2 = requireAdmin(user);
    if (denied2) return denied2;
    const url = new URL(request.url);
    const affId = url.searchParams.get('affiliate_id') || '';
    const status = url.searchParams.get('status') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

    let query = `SELECT c.*, a.email as affiliate_email, a.name as affiliate_name, b.email as buyer_email
      FROM commissions c
      JOIN users a ON c.affiliate_id = a.id
      JOIN users b ON c.buyer_id = b.id WHERE 1=1`;
    const params = [];
    if (affId) { query += ' AND c.affiliate_id = ?'; params.push(parseInt(affId)); }
    if (status) { query += ' AND c.status = ?'; params.push(status); }
    query += ' ORDER BY c.created_at DESC LIMIT ?';
    params.push(limit);

    const rows = await env.DB.prepare(query).bind(...params).all();
    return jsonResponse({ commissions: rows.results });
  }

  // PUT /api/admin/commissions/:id — mark as paid
  const commMatch = path.match(/^\/api\/admin\/commissions\/(\d+)$/);
  if (request.method === 'PUT' && commMatch) {
    const denied2 = requireAdmin(user);
    if (denied2) return denied2;
    const id = parseInt(commMatch[1]);
    const body = await request.json();
    if (body.status === 'paid') {
      await env.DB.prepare("UPDATE commissions SET status = 'paid', paid_at = datetime('now') WHERE id = ?").bind(id).run();
    }
    return jsonResponse({ message: 'Đã cập nhật' });
  }

  // POST /api/admin/commissions/pay-all — pay all pending for an affiliate
  if (request.method === 'POST' && path === '/api/admin/commissions/pay-all') {
    const denied2 = requireAdmin(user);
    if (denied2) return denied2;
    const body = await request.json();
    const { affiliate_id } = body;
    if (!affiliate_id) return jsonResponse({ error: 'Thiếu affiliate_id' }, 400);
    const result = await env.DB.prepare(
      "UPDATE commissions SET status = 'paid', paid_at = datetime('now') WHERE affiliate_id = ? AND status = 'pending'"
    ).bind(affiliate_id).run();
    return jsonResponse({ message: 'Đã thanh toán tất cả', count: result.meta.changes });
  }

  // ===== REDEMPTION MANAGEMENT (admin) =====
  // GET /api/admin/redemptions
  if (request.method === 'GET' && path === '/api/admin/redemptions') {
    const denied2 = requireAdmin(user);
    if (denied2) return denied2;
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    let query = `SELECT r.*, u.email as affiliate_email, u.name as affiliate_name FROM redemptions r JOIN users u ON r.affiliate_id = u.id WHERE 1=1`;
    const params = [];
    if (status) { query += ' AND r.status = ?'; params.push(status); }
    query += ' ORDER BY r.created_at DESC LIMIT 100';
    const rows = await env.DB.prepare(query).bind(...params).all();
    return jsonResponse({ redemptions: rows.results });
  }

  // PUT /api/admin/redemptions/:id — approve/reject
  const redeemMatch = path.match(/^\/api\/admin\/redemptions\/(\d+)$/);
  if (request.method === 'PUT' && redeemMatch) {
    const denied2 = requireAdmin(user);
    if (denied2) return denied2;
    const id = parseInt(redeemMatch[1]);
    const body = await request.json();
    if (!['approved', 'rejected'].includes(body.status)) return jsonResponse({ error: 'Status phải là approved hoặc rejected' }, 400);

    const redemption = await env.DB.prepare('SELECT * FROM redemptions WHERE id = ?').bind(id).first();
    if (!redemption) return jsonResponse({ error: 'Không tìm thấy' }, 404);
    if (redemption.status !== 'pending') return jsonResponse({ error: 'Đã xử lý rồi' }, 400);

    if (body.status === 'rejected') {
      // Refund: re-create pending commissions for the amount
      await env.DB.prepare(
        "INSERT INTO commissions (affiliate_id, order_id, buyer_id, amount, commission, rate, status, created_at) VALUES (?, 0, ?, 0, ?, 0, 'pending', datetime('now'))"
      ).bind(redemption.affiliate_id, redemption.affiliate_id, redemption.points_used).run();
    }

    if (body.status === 'approved' && redemption.type === 'cash') {
      // Deduct commissions for cash withdrawal
      let remaining = redemption.points_used;
      const pending = await env.DB.prepare(
        "SELECT id, commission FROM commissions WHERE affiliate_id = ? AND status = 'pending' ORDER BY created_at ASC"
      ).bind(redemption.affiliate_id).all();
      for (const c of pending.results) {
        if (remaining <= 0) break;
        if (c.commission <= remaining) {
          await env.DB.prepare("UPDATE commissions SET status = 'paid', paid_at = datetime('now') WHERE id = ?").bind(c.id).run();
          remaining -= c.commission;
        } else {
          const leftover = c.commission - remaining;
          await env.DB.prepare("UPDATE commissions SET commission = ? WHERE id = ?").bind(leftover, c.id).run();
          remaining = 0;
        }
      }
    }

    await env.DB.prepare(
      "UPDATE redemptions SET status = ?, processed_at = datetime('now'), note = ? WHERE id = ?"
    ).bind(body.status, body.note || '', id).run();

    return jsonResponse({ message: body.status === 'approved' ? 'Đã duyệt' : 'Đã từ chối' });
  }

  // ===== BANK TRANSACTIONS (superadmin only) =====
  // GET /api/admin/bank-transactions — fetch from Web2M API v3, supports multi-day via loop
  if (request.method === 'GET' && path === '/api/admin/bank-transactions') {
    const denied2 = requireSuperAdmin(user);
    if (denied2) return denied2;
    const { ACB_PASSWORD, ACB_ACCOUNT, ACB_API_TOKEN } = env;
    if (!ACB_PASSWORD || !ACB_ACCOUNT || !ACB_API_TOKEN || ACB_PASSWORD === 'CHANGE_ME') {
      return jsonResponse({ error: 'ACB API chưa cấu hình. Cập nhật ACB_PASSWORD và ACB_API_TOKEN trong wrangler.toml' }, 500);
    }
    try {
      const url = new URL(request.url);
      const fromDate = url.searchParams.get('fromDate'); // DD-MM-YYYY
      const toDate = url.searchParams.get('toDate');     // DD-MM-YYYY

      // Helper: parse DD-MM-YYYY to Date object
      function parseDMY(s) {
        if (!s) return null;
        const [d, m, y] = s.split('-').map(Number);
        return new Date(y, m - 1, d);
      }
      // Helper: format Date to DD-MM-YYYY
      function fmtDMY(dt) {
        const dd = String(dt.getDate()).padStart(2, '0');
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const yyyy = dt.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
      }

      // Build list of dates to fetch
      const dates = [];
      if (fromDate && toDate) {
        let cur = parseDMY(fromDate);
        const end = parseDMY(toDate);
        if (cur && end) {
          // Cap at 90 days to avoid abuse
          const maxDays = 90;
          let count = 0;
          while (cur <= end && count < maxDays) {
            dates.push(fmtDMY(cur));
            cur.setDate(cur.getDate() + 1);
            count++;
          }
        }
      }

      let allTransactions = [];

      if (dates.length > 0) {
        // Fetch each day in parallel (Web2M returns 1 day per call)
        const fetches = dates.map(async (dateStr) => {
          const apiUrl = `https://api.web2m.com/historyapiacb/${ACB_PASSWORD}/${ACB_ACCOUNT}/${ACB_API_TOKEN}/${dateStr}`;
          try {
            const resp = await fetch(apiUrl);
            if (!resp.ok) return [];
            const data = await resp.json();
            if (!data.success && !data.status) return [];
            return data.transactions || [];
          } catch { return []; }
        });
        const results = await Promise.all(fetches);
        allTransactions = results.flat();
      } else {
        // No date range — fetch today only (default behavior)
        const apiUrl = `https://api.web2m.com/historyapiacb/${ACB_PASSWORD}/${ACB_ACCOUNT}/${ACB_API_TOKEN}`;
        const resp = await fetch(apiUrl);
        if (!resp.ok) return jsonResponse({ error: 'Lỗi Web2M API: HTTP ' + resp.status }, 502);
        const data = await resp.json();
        if (!data.success && !data.status) return jsonResponse({ error: data.message || 'Lỗi Web2M API' }, 502);
        allTransactions = data.transactions || [];
      }

      // Sort by postingDate desc (newest first)
      allTransactions.sort((a, b) => (b.postingDate || 0) - (a.postingDate || 0));

      return jsonResponse({ transactions: allTransactions, total: allTransactions.length });
    } catch (e) {
      return jsonResponse({ error: 'Lỗi kết nối Web2M: ' + e.message }, 502);
    }
  }

  // GET /api/admin/webhook-logs — superadmin only
  if (path === '/api/admin/webhook-logs' && request.method === 'GET') {
    const sa = requireSuperAdmin(user);
    if (sa) return sa;
    const rows = await env.DB.prepare(
      'SELECT * FROM webhook_logs ORDER BY id DESC LIMIT 50'
    ).all();
    return jsonResponse({ logs: rows.results });
  }

  // DELETE /api/admin/webhook-logs — clear all logs
  if (path === '/api/admin/webhook-logs' && request.method === 'DELETE') {
    const sa = requireSuperAdmin(user);
    if (sa) return sa;
    await env.DB.prepare('DELETE FROM webhook_logs').run();
    return jsonResponse({ ok: true });
  }

  // POST /api/admin/fix-tokens — repair corrupt JSON tokens in DB (superadmin only)
  if (request.method === 'POST' && path === '/api/admin/fix-tokens') {
    const sa = requireSuperAdmin(user);
    if (sa) return sa;

    const rows = await env.DB.prepare('SELECT id, sso_token FROM grok_accounts').all();
    let fixed = 0, failed = 0, skipped = 0;
    const errors = [];

    for (const row of rows.results) {
      const raw = row.sso_token;
      // Check if already valid JSON
      try {
        JSON.parse(raw);
        skipped++;
        continue;
      } catch {}

      // Try to fix corrupt JSON (missing quotes)
      if (raw.startsWith('[{') && raw.includes('name:') && raw.includes('value:')) {
        try {
          const fixed_json = raw
            .replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":')
            .replace(/:([^,}\]\d\[{][^,}\]]*)/g, (match, val) => {
              const v = val.trim();
              if (v === 'true' || v === 'false' || v === 'null' || v === '') return match;
              if (v.startsWith('"')) return match;
              return ':"' + v + '"';
            });
          const parsed = JSON.parse(fixed_json);
          const compact = JSON.stringify(parsed);
          await env.DB.prepare('UPDATE grok_accounts SET sso_token = ? WHERE id = ?').bind(compact, row.id).run();
          fixed++;
          continue;
        } catch (e) {
          errors.push({ id: row.id, error: e.message });
          failed++;
        }
      } else {
        skipped++;
      }
    }

    return jsonResponse({ message: `Fixed ${fixed}, skipped ${skipped}, failed ${failed}`, fixed, skipped, failed, errors });
  }

  return jsonResponse({ error: 'Không tìm thấy' }, 404);
}
