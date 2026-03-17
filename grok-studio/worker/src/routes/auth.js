import { createJWT } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/hash.js';
import { jsonResponse } from '../utils/response.js';

export async function handleAuth(request, env, path) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  async function getBody() {
    try { return await request.clone().json(); } catch { return {}; }
  }

  if (path === '/api/auth/register') {
    const { email, password, name, ref } = await getBody();
    if (!email || !password) return jsonResponse({ error: 'Email and password required' }, 400);
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return jsonResponse({ error: 'Email already registered' }, 409);
    const hash = await hashPassword(password);

    // Check referral code
    let referredBy = null;
    if (ref) {
      const affiliate = await env.DB.prepare('SELECT id FROM users WHERE ref_code = ? AND is_affiliate = 1').bind(ref).first();
      if (affiliate) referredBy = affiliate.id;
    }

    const result = await env.DB.prepare(
      'INSERT INTO users (email, password_hash, name, referred_by) VALUES (?, ?, ?, ?)'
    ).bind(email, hash, name || '', referredBy).run();
    const userId = result.meta.last_row_id;
    // Single-device: generate session_id
    const sessionId = crypto.randomUUID();
    await env.DB.prepare("UPDATE users SET active_session = ? WHERE id = ?").bind(sessionId, userId).run();
    const token = await createJWT({ sub: userId, email, role: 'user', sid: sessionId }, env.JWT_SECRET);
    return jsonResponse({ token, user: { id: userId, email, name: name || '', plan: 'free', credits: 10, role: 'user' } });
  }

  if (path === '/api/auth/login') {
    const { email, password, source, ref } = await getBody();
    if (!email || !password) return jsonResponse({ error: 'Email and password required' }, 400);
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user) return jsonResponse({ error: 'Invalid credentials' }, 401);
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return jsonResponse({ error: 'Invalid credentials' }, 401);
    // If user has no referrer yet and ref code provided, set it
    if (ref && !user.referred_by) {
      const affiliate = await env.DB.prepare('SELECT id FROM users WHERE ref_code = ? AND is_affiliate = 1').bind(ref).first();
      if (affiliate && affiliate.id !== user.id) {
        await env.DB.prepare("UPDATE users SET referred_by = ?, updated_at = datetime('now') WHERE id = ?").bind(affiliate.id, user.id).run();
      }
    }
    // Multi-device: separate sessions for web and tool
    const sessionId = crypto.randomUUID();
    const src = source === 'tool' ? 'tool' : 'web';
    if (src === 'tool') {
      await env.DB.prepare("UPDATE users SET tool_session = ?, updated_at = datetime('now') WHERE id = ?").bind(sessionId, user.id).run();
    } else {
      await env.DB.prepare("UPDATE users SET active_session = ?, updated_at = datetime('now') WHERE id = ?").bind(sessionId, user.id).run();
    }
    const token = await createJWT({ sub: user.id, email: user.email, role: user.role || 'user', sid: sessionId, src }, env.JWT_SECRET);
    return jsonResponse({
      token,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan, credits: user.credits, role: user.role || 'user', is_affiliate: user.is_affiliate || 0, ref_code: user.ref_code || null }
    });
  }

  if (path === '/api/auth/me') {
    const { verifyJWT } = await import('../utils/jwt.js');
    const payload = await verifyJWT(request, env);
    if (!payload) return jsonResponse({ error: 'Unauthorized' }, 401);
    const user = await env.DB.prepare(
      'SELECT id,email,name,plan,credits,role,daily_limit,video_limit,plan_expires,created_at,is_affiliate,ref_code FROM users WHERE id = ?'
    ).bind(payload.sub).first();
    if (!user) return jsonResponse({ error: 'User not found' }, 404);
    const accCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM grok_accounts WHERE user_id = ?').bind(payload.sub).first();
    user.account_count = accCount?.cnt || 0;
    return jsonResponse({ user });
  }

  if (path === '/api/auth/profile') {
    const { verifyJWT } = await import('../utils/jwt.js');
    const payload = await verifyJWT(request, env);
    if (!payload) return jsonResponse({ error: 'Unauthorized' }, 401);
    const body = await getBody();
    const { name, password, current_password } = body;
    const sets = [];
    const params = [];
    if (name !== undefined) { sets.push('name = ?'); params.push(name); }
    if (password) {
      if (!current_password) return jsonResponse({ error: 'Nhập mật khẩu hiện tại' }, 400);
      const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(payload.sub).first();
      const valid = await verifyPassword(current_password, user.password_hash);
      if (!valid) return jsonResponse({ error: 'Mật khẩu hiện tại không đúng' }, 401);
      sets.push('password_hash = ?'); params.push(await hashPassword(password));
    }
    if (!sets.length) return jsonResponse({ error: 'Không có gì để cập nhật' }, 400);
    sets.push("updated_at = datetime('now')");
    params.push(payload.sub);
    await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
    const updated = await env.DB.prepare(
      'SELECT id,email,name,plan,credits,role,daily_limit,video_limit,plan_expires FROM users WHERE id = ?'
    ).bind(payload.sub).first();
    return jsonResponse({ user: updated, message: 'Đã cập nhật' });
  }

  return jsonResponse({ error: 'Not found' }, 404);
}
