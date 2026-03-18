import { jsonResponse } from '../utils/response.js';

function extractSsoValue(raw) {
  if (Array.isArray(raw)) {
    const sso = raw.find(c => c.name === 'sso');
    if (sso?.value) return sso.value;
    return null;
  }
  if (typeof raw !== 'string') return null;
  try {
    const cookies = JSON.parse(raw);
    if (Array.isArray(cookies)) {
      const sso = cookies.find(c => c.name === 'sso');
      if (sso?.value) return sso.value;
    }
  } catch {}
  const clean = raw.trim();
  if (clean.startsWith('sso=')) return clean.slice(4);
  return clean;
}

function makePreview(raw) {
  const val = extractSsoValue(typeof raw === 'string' ? raw : JSON.stringify(raw));
  return val ? val.substring(0, 20) + '...' : '(invalid)';
}

// Normalize token: ensure valid JSON, trim whitespace
function normalizeToken(raw) {
  if (typeof raw !== 'string') {
    try { return JSON.stringify(raw); } catch { return String(raw); }
  }
  const trimmed = raw.trim();
  // If it's valid JSON, re-serialize to compact form
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed); // compact JSON, preserves quotes
  } catch {}
  // If it looks like corrupt JSON (missing quotes), try to fix it
  // Pattern: [{domain:...,name:...,value:...},...] — add quotes to keys and string values
  if (trimmed.startsWith('[{') && trimmed.includes('name:') && trimmed.includes('value:')) {
    try {
      // Add quotes around keys and string values
      const fixed = trimmed.replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":')
        .replace(/:([^,}\]\d\[{][^,}\]]*)/g, (match, val) => {
          const v = val.trim();
          if (v === 'true' || v === 'false' || v === 'null' || v === '') return match;
          if (v.startsWith('"')) return match;
          return ':"' + v + '"';
        });
      const parsed = JSON.parse(fixed);
      return JSON.stringify(parsed);
    } catch {}
  }
  return trimmed;
}

// Analyze cookie freshness
function analyzeCookies(raw) {
  const info = { hasSso: false, hasCfBm: false, hasCfClearance: false, hasTwpid: false, cfBmExpiry: null, ssoExpiry: null, allExpired: false };
  const nowSec = Date.now() / 1000;
  try {
    const cookies = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
    if (!Array.isArray(cookies)) return info;
    for (const c of cookies) {
      const expired = c.expirationDate && c.expirationDate < nowSec;
      if (c.name === 'sso') { info.hasSso = true; info.ssoExpiry = c.expirationDate || null; if (expired) info.ssoExpired = true; }
      if (c.name === '__cf_bm') { info.hasCfBm = !expired; info.cfBmExpiry = c.expirationDate || null; }
      if (c.name === 'cf_clearance') { info.hasCfClearance = !expired; }
      if (c.name === '_twpid') { info.hasTwpid = !expired; }
    }
  } catch {}
  return info;
}

export async function handleAccounts(request, env, user, path) {
  const userId = user.sub;

  // Auto-unlock tokens that have been limited for > 2 hours
  try {
    await env.DB.prepare(
      "UPDATE grok_accounts SET status = 'active', limited_at = NULL WHERE user_id = ? AND status = 'limited' AND limited_at IS NOT NULL AND limited_at <= datetime('now', '-2 hours')"
    ).bind(userId).run();
  } catch {}

  // GET /api/accounts - list accounts with cookie freshness info
  if (request.method === 'GET' && path === '/api/accounts') {
    const rows = await env.DB.prepare(
      'SELECT id, label, sso_token, status, limited_at, last_used, created_at FROM grok_accounts WHERE user_id = ?'
    ).bind(userId).all();
    const accounts = rows.results.map(a => {
      const cookieInfo = analyzeCookies(a.sso_token);
      // Calculate unlock time for limited tokens
      let limitInfo = null;
      if (a.status === 'limited' && a.limited_at) {
        const limitedAt = new Date(a.limited_at + 'Z');
        const unlockAt = new Date(limitedAt.getTime() + 2 * 60 * 60 * 1000); // +2h
        const now = new Date();
        const remainingMs = Math.max(0, unlockAt.getTime() - now.getTime());
        const remainingMin = Math.ceil(remainingMs / 60000);
        limitInfo = {
          limited_at: a.limited_at,
          unlock_at: unlockAt.toISOString(),
          remaining_minutes: remainingMin,
          remaining_text: remainingMin > 60 ? `${Math.floor(remainingMin/60)}h${remainingMin%60}m` : `${remainingMin}m`,
        };
      }
      return {
        ...a,
        token_preview: makePreview(a.sso_token),
        sso_token: undefined,
        cookie_info: cookieInfo,
        limit_info: limitInfo,
      };
    });
    return jsonResponse({ accounts });
  }

  // POST /api/accounts - add account (supports bulk: body.tokens array)
  if (request.method === 'POST' && path === '/api/accounts') {
    const body = await request.json();

    // Check plan limits
    const userRow = await env.DB.prepare('SELECT plan, role FROM users WHERE id = ?').bind(userId).first();
    let maxAccounts = Infinity;
    if (userRow.role !== 'admin' && userRow.role !== 'superadmin') {
      const plan = await env.DB.prepare('SELECT max_accounts FROM plans WHERE id = ?').bind(userRow.plan).first();
      maxAccounts = plan.max_accounts;
    }
    const currentCount = (await env.DB.prepare('SELECT COUNT(*) as cnt FROM grok_accounts WHERE user_id = ?').bind(userId).first()).cnt;

    // Bulk mode: body.tokens is an array of raw token strings
    if (Array.isArray(body.tokens)) {
      let added = 0, errors = [];
      for (const item of body.tokens) {
        if (currentCount + added >= maxAccounts) { errors.push('Đã đạt giới hạn plan'); break; }
        const raw = typeof item === 'string' ? item : (item.sso_token || JSON.stringify(item));
        const label = typeof item === 'object' && item.label ? item.label : '';
        const ssoVal = extractSsoValue(raw);
        if (!ssoVal || ssoVal.length < 10) { errors.push('Token không hợp lệ: ' + String(raw).substring(0, 20) + '...'); continue; }
        const tokenStr = normalizeToken(raw);
        try {
          await env.DB.prepare('INSERT INTO grok_accounts (user_id, sso_token, label) VALUES (?, ?, ?)').bind(userId, tokenStr, label).run();
          added++;
        } catch (e) { errors.push(e.message); }
      }
      return jsonResponse({ added, errors, message: `Đã thêm ${added} token` + (errors.length ? `, ${errors.length} lỗi` : '') });
    }

    // Single mode
    const { sso_token, label } = body;
    if (!sso_token) return jsonResponse({ error: 'Vui lòng nhập cookie/token' }, 400);

    const ssoVal = extractSsoValue(sso_token);
    if (!ssoVal || ssoVal.length < 10) {
      return jsonResponse({ error: 'Token không hợp lệ. Hỗ trợ: cookie JSON array, chuỗi SSO token, hoặc sso=VALUE' }, 400);
    }

    if (currentCount >= maxAccounts) {
      return jsonResponse({ error: `Plan limit: max ${maxAccounts} accounts` }, 403);
    }

    const tokenStr = normalizeToken(sso_token);
    const result = await env.DB.prepare(
      'INSERT INTO grok_accounts (user_id, sso_token, label) VALUES (?, ?, ?)'
    ).bind(userId, tokenStr, label || '').run();

    return jsonResponse({ id: result.meta.last_row_id, message: 'Đã thêm tài khoản' });
  }

  // PUT /api/accounts/:id - update cookies for existing account
  const updateMatch = path.match(/^\/api\/accounts\/(\d+)$/);
  if (request.method === 'PUT' && updateMatch) {
    const id = parseInt(updateMatch[1]);
    const { sso_token, label } = await request.json();

    // Verify ownership
    const existing = await env.DB.prepare('SELECT id FROM grok_accounts WHERE id = ? AND user_id = ?').bind(id, userId).first();
    if (!existing) return jsonResponse({ error: 'Không tìm thấy tài khoản' }, 404);

    if (sso_token) {
      const ssoVal = extractSsoValue(sso_token);
      if (!ssoVal || ssoVal.length < 10) {
        return jsonResponse({ error: 'Định dạng cookie không hợp lệ' }, 400);
      }
      const tokenStr = normalizeToken(sso_token);
      await env.DB.prepare("UPDATE grok_accounts SET sso_token = ?, status = 'active' WHERE id = ?")
        .bind(tokenStr, id).run();
    }
    if (label !== undefined) {
      await env.DB.prepare("UPDATE grok_accounts SET label = ? WHERE id = ?")
        .bind(label, id).run();
    }

    return jsonResponse({ message: 'Đã cập nhật tài khoản' });
  }

  // DELETE /api/accounts/bulk - bulk delete accounts
  if (request.method === 'DELETE' && path === '/api/accounts/bulk') {
    const body = await request.json();
    const ids = body.ids;
    if (!Array.isArray(ids) || !ids.length) return jsonResponse({ error: 'Thiếu danh sách ids' }, 400);
    let deleted = 0;
    for (const id of ids) {
      const r = await env.DB.prepare('DELETE FROM grok_accounts WHERE id = ? AND user_id = ?').bind(id, userId).run();
      if (r.meta.changes > 0) deleted++;
    }
    return jsonResponse({ deleted, message: `Đã xóa ${deleted} token` });
  }

  // DELETE /api/accounts/:id
  const deleteMatch = path.match(/^\/api\/accounts\/(\d+)$/);
  if (request.method === 'DELETE' && deleteMatch) {
    const id = parseInt(deleteMatch[1]);
    await env.DB.prepare('DELETE FROM grok_accounts WHERE id = ? AND user_id = ?').bind(id, userId).run();
    return jsonResponse({ message: 'Đã xóa' });
  }

  return jsonResponse({ error: 'Không tìm thấy' }, 404);
}
