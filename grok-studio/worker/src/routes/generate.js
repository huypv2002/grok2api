import { jsonResponse } from '../utils/response.js';

const GROK2API_KEY = 'grok2api';

// ── Save media to R2 for permanent storage ──
async function saveToR2(env, outputUrl, type, historyId) {
  try {
    const isVideo = type.includes('video') || type === 'extend_video';

    const resp = await fetch(outputUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!resp.ok) return null;

    const contentType = resp.headers.get('content-type') || (isVideo ? 'video/mp4' : 'image/png');
    // Detect extension from actual content-type
    let ext = isVideo ? 'mp4' : 'png';
    if (!isVideo) {
      if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
      else if (contentType.includes('webp')) ext = 'webp';
    }
    const key = `media/${historyId}.${ext}`;

    await env.MEDIA.put(key, resp.body, {
      httpMetadata: { contentType },
    });

    return `/api/media/${key}`;
  } catch (e) {
    console.error('R2 save failed:', e.message);
    return null;
  }
}
// UA must match the one used by zendriver to get cf_clearance
const CF_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

// ─── DB helpers ───
async function getRandomToken(env, userId) {
  // First try active tokens only
  const active = await env.DB.prepare(
    "SELECT id, sso_token FROM grok_accounts WHERE user_id = ? AND status = 'active' ORDER BY RANDOM() LIMIT 1"
  ).bind(userId).first();
  if (active) return active;
  // If no active tokens, try limited ones that have been cooling for > 2 hours (auto-unlock)
  const cooled = await env.DB.prepare(
    "SELECT id, sso_token FROM grok_accounts WHERE user_id = ? AND status = 'limited' AND limited_at <= datetime('now', '-2 hours') ORDER BY RANDOM() LIMIT 1"
  ).bind(userId).first();
  if (cooled) {
    // Auto-unlock this token
    await env.DB.prepare("UPDATE grok_accounts SET status = 'active', limited_at = NULL WHERE id = ?").bind(cooled.id).run();
    return cooled;
  }
  return null;
}
async function checkCredits(env, userId) {
  const u = await env.DB.prepare('SELECT credits, plan, role FROM users WHERE id = ?').bind(userId).first();
  if (!u) return false;
  return u.role === 'admin' || u.role === 'superadmin' || u.plan === 'unlimited' || u.credits > 0 || u.credits === -1;
}
async function checkDailyLimit(env, userId, type) {
  const u = await env.DB.prepare('SELECT plan, role, daily_limit, video_limit, plan_expires FROM users WHERE id = ?').bind(userId).first();
  if (!u) return { ok: false, msg: 'Không tìm thấy người dùng' };
  if (u.role === 'admin' || u.role === 'superadmin') return { ok: true };

  // Check plan expiry
  if (u.plan_expires) {
    const now = new Date().toISOString().slice(0, 10);
    if (now > u.plan_expires) {
      return { ok: false, msg: `Gói đã hết hạn (${u.plan_expires}). Liên hệ admin để gia hạn.`, expired: true };
    }
  }

  const p = await env.DB.prepare('SELECT daily_limit, video_limit FROM plans WHERE id = ?').bind(u.plan).first();

  // Per-user override takes priority; -1 means use plan default; 0 means blocked
  const effectiveDaily = (u.daily_limit !== null && u.daily_limit !== -1) ? u.daily_limit : (p?.daily_limit ?? -1);
  const effectiveVideo = (u.video_limit !== null && u.video_limit !== -1) ? u.video_limit : (p?.video_limit ?? -1);

  // Check daily total limit
  if (effectiveDaily > 0) {
    const today = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM history WHERE user_id = ? AND created_at >= date('now')"
    ).bind(userId).first();
    if (today.cnt >= effectiveDaily) {
      return { ok: false, msg: `Đã đạt giới hạn ${effectiveDaily} lượt/ngày. Nâng cấp gói để tạo thêm.` };
    }
  }

  // Check daily video limit
  const isVideo = ['text2video', 'image2video', 'extend_video'].includes(type);
  if (isVideo && effectiveVideo > 0) {
    const todayVid = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM history WHERE user_id = ? AND created_at >= date('now') AND type IN ('text2video','image2video','extend_video')"
    ).bind(userId).first();
    if (todayVid.cnt >= effectiveVideo) {
      return { ok: false, msg: `Đã đạt giới hạn ${effectiveVideo} video/ngày. Nâng cấp gói để tạo thêm.` };
    }
  }

  return { ok: true };
}
async function deductCredit(env, userId) {
  // credits = -1 means unlimited, don't deduct
  await env.DB.prepare("UPDATE users SET credits = MAX(0, credits - 1), updated_at = datetime('now') WHERE id = ? AND credits > 0 AND plan != 'unlimited' AND role NOT IN ('admin','superadmin')").bind(userId).run();
}
async function checkFeature(env, userId, feature) {
  const u = await env.DB.prepare('SELECT plan, role FROM users WHERE id = ?').bind(userId).first();
  if (u.role === 'admin' || u.role === 'superadmin') return true;
  const p = await env.DB.prepare('SELECT features FROM plans WHERE id = ?').bind(u.plan).first();
  if (!p) return true; // plan not found in DB, allow by default
  return !!JSON.parse(p.features || '{}')[feature];
}

// ─── Cookie parsing ───
function parseCookies(rawInput) {
  const r = { sso: '', ssoRw: '', cookieStr: '', cfClearance: '', cfBm: '' };

  // Try standard JSON parse first
  try {
    const arr = JSON.parse(rawInput);
    if (Array.isArray(arr)) {
      const map = {};
      for (const c of arr) { if (c.name && c.value) map[c.name] = c.value; }
      r.sso = map['sso'] || '';
      r.ssoRw = map['sso-rw'] || r.sso;
      r.cfClearance = map['cf_clearance'] || '';
      r.cfBm = map['__cf_bm'] || '';
      r.cookieStr = arr.map(c => `${c.name}=${c.value}`).join('; ');
      return r;
    }
  } catch {}

  // Fallback: corrupt JSON (missing quotes) — extract values via regex
  // Handles: [{domain:...,name:sso,value:eyJ...},{...}]
  if (rawInput.includes('name:') && rawInput.includes('value:')) {
    const cookieBlocks = rawInput.split(/\},?\s*\{/).map(s => s.replace(/[\[\]{}]/g, ''));
    for (const block of cookieBlocks) {
      const nameMatch = block.match(/(?:^|,)name:([^,}]+)/);
      const valueMatch = block.match(/(?:^|,)value:([^,}]+)/);
      if (nameMatch && valueMatch) {
        const name = nameMatch[1].trim();
        const value = valueMatch[1].trim();
        if (name === 'sso') r.sso = value;
        if (name === 'sso-rw') r.ssoRw = value;
        if (name === 'cf_clearance') r.cfClearance = value;
        if (name === '__cf_bm') r.cfBm = value;
      }
    }
    if (r.sso) {
      if (!r.ssoRw) r.ssoRw = r.sso;
      // Build cookieStr from extracted values
      const parts = [];
      if (r.sso) parts.push(`sso=${r.sso}`);
      if (r.ssoRw) parts.push(`sso-rw=${r.ssoRw}`);
      if (r.cfClearance) parts.push(`cf_clearance=${r.cfClearance}`);
      if (r.cfBm) parts.push(`__cf_bm=${r.cfBm}`);
      r.cookieStr = parts.join('; ');
      return r;
    }
  }

  const clean = rawInput.trim();
  r.sso = clean.startsWith('sso=') ? clean.slice(4) : clean;
  r.ssoRw = r.sso;
  r.cookieStr = `sso=${r.sso}; sso-rw=${r.ssoRw}`;
  return r;
}

// ─── Grok2API injection: push user's SSO + CF cookies into Grok2API before each request ───
async function injectIntoGrok2API(apiBase, cookies) {
  // 1) Clear existing tokens then inject fresh SSO-only token
  //    Grok2API expects plain SSO JWT value, NOT full cookie JSON array
  const ssoToken = cookies.sso;
  if (!ssoToken) throw new Error('Không tìm thấy SSO token để inject');

  try {
    // First DELETE existing tokens to avoid stale/malformed tokens in pool
    try {
      await fetch(`${apiBase}/v1/admin/tokens`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${GROK2API_KEY}` },
      });
    } catch {}

    // Then inject clean SSO JWT into both pools
    const r = await fetch(`${apiBase}/v1/admin/tokens`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROK2API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ssoBasic: [{ token: ssoToken }],
        ssoSuper: [{ token: ssoToken }],
      }),
    });
    if (!r.ok && r.status >= 500) {
      console.error('Grok2API inject SSO returned:', r.status);
    }
  } catch (e) {
    // Network error = tunnel is down, propagate it
    throw new Error(`Không kết nối được Grok2API (tunnel đứt?): ${e.message}`);
  }

  // 2) Inject cf_clearance + __cf_bm into proxy config
  try {
    const cfConfig = {};
    if (cookies.cfClearance) {
      cfConfig.cf_clearance = cookies.cfClearance;
    }
    if (cookies.cookieStr) {
      const cfParts = cookies.cookieStr.split('; ')
        .filter(p => {
          const name = p.split('=')[0];
          return name !== 'sso' && name !== 'sso-rw';
        });
      if (cfParts.length > 0) {
        cfConfig.cf_cookies = cfParts.join('; ');
      }
    }
    if (Object.keys(cfConfig).length > 0) {
      cfConfig.user_agent = CF_USER_AGENT;
      await fetch(`${apiBase}/v1/admin/config`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROK2API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proxy: cfConfig,
          app: { video_format: 'url', app_url: apiBase },
        }),
      });
    }
  } catch (e) {
    console.error('Failed to inject CF config:', e.message);
  }
}

// ─── Video generation via Grok2API /v1/videos ───
async function generateVideoViaAPI(apiBase, cookies, prompt, opts = {}) {
  await injectIntoGrok2API(apiBase, cookies);

  const { aspect_ratio = '16:9', video_length = 6, resolution = '480p' } = opts;
  const sizeMap = { '16:9': '1280x720', '9:16': '720x1280', '1:1': '1024x1024', '3:2': '1792x1024', '2:3': '1024x1792' };

  const resp = await fetch(`${apiBase}/v1/videos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROK2API_KEY}`,
      'X-Sso-Token': cookies.sso,
    },
    body: JSON.stringify({
      prompt,
      size: sizeMap[aspect_ratio] || '1280x720',
      seconds: video_length || 6,
      quality: resolution === '720p' ? 'high' : 'standard',
    }),
  });

  let result;
  try { result = await resp.json(); } catch {
    try { const txt = await resp.text(); result = { _rawText: txt }; } catch { result = {}; }
  }
  const respText = JSON.stringify(result).substring(0, 500);

  if (!resp.ok || result?.error) {
    const msg = result?.error?.message || (typeof result?.detail === 'string' ? result.detail : '') || result?._rawText || `Tạo video thất bại (HTTP ${resp.status}): ${respText}`;
    // Detect REAL rate limit — check body first (Grok2API wraps 429 inside 502)
    const fullText = msg + ' ' + respText;
    const isRateLimit = resp.status === 429 || fullText.includes('rate limit') || fullText.includes('cooling') || fullText.includes('quota') || fullText.includes('Too many') || fullText.includes('Chat failed, 429') || fullText.includes('failed, 429') || fullText.includes('rate_limited');
    if (isRateLimit) {
      throw new Error(`RATE_LIMITED: Token Grok đã bị giới hạn tạo video/ảnh. Vui lòng đợi 1h30-2h để reset hoặc thử token khác.`);
    }
    // Detect CF block
    if (resp.status === 403 || msg.includes('403') || msg.includes('Cloudflare')) {
      throw new Error(`CF_BLOCKED: Bị chặn bởi Cloudflare. Cần cập nhật cookie cf_clearance mới từ grok.com.`);
    }
    // 502/503 — transient server error
    if (resp.status === 502 || resp.status === 503) {
      throw new Error(`SERVER_ERROR: Máy chủ Grok tạm thời lỗi (${resp.status}). Vui lòng thử lại sau vài phút.`);
    }
    throw new Error(msg);
  }

  // Grok2API returns either:
  // Format 1 (OpenAI-compatible): { data: [{ url: "..." }] }
  // Format 2 (direct): { url: "..." }
  if (result?.url) return result.url;
  const url = result?.data?.[0]?.url;
  if (url) return url.startsWith('/') ? apiBase + url : url;

  // Fallback: try extracting URL from choices (chat completions format)
  const content = result?.choices?.[0]?.message?.content || '';
  const m = content.match(/https?:\/\/[^\s"'<>]+\.(mp4|webm)/i);
  if (m) return m[0];

  throw new Error('Tạo video không trả về URL. Có thể prompt bị từ chối bởi Grok.');
}

// ─── Generate video and return full result (url + reference_id) for chaining ───
async function generateVideoFull(apiBase, cookies, prompt, opts = {}) {
  await injectIntoGrok2API(apiBase, cookies);

  const { aspect_ratio = '16:9', video_length = 6, resolution = '480p' } = opts;
  const sizeMap = { '16:9': '1280x720', '9:16': '720x1280', '1:1': '1024x1024', '3:2': '1792x1024', '2:3': '1024x1792' };

  const resp = await fetch(`${apiBase}/v1/videos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROK2API_KEY}`,
      'X-Sso-Token': cookies.sso,
    },
    body: JSON.stringify({
      prompt,
      size: sizeMap[aspect_ratio] || '1280x720',
      seconds: video_length || 6,
      quality: resolution === '720p' ? 'high' : 'standard',
    }),
  });

  let result;
  try { result = await resp.json(); } catch {
    try { const txt = await resp.text(); result = { _rawText: txt }; } catch { result = {}; }
  }
  const respText = JSON.stringify(result).substring(0, 500);

  if (!resp.ok || result?.error) {
    const msg = result?.error?.message || (typeof result?.detail === 'string' ? result.detail : '') || result?._rawText || `Tạo video thất bại (HTTP ${resp.status}): ${respText}`;
    const fullText = msg + ' ' + respText;
    const isRateLimit = resp.status === 429 || fullText.includes('rate limit') || fullText.includes('cooling') || fullText.includes('quota') || fullText.includes('Too many') || fullText.includes('Chat failed, 429') || fullText.includes('failed, 429') || fullText.includes('rate_limited');
    if (isRateLimit) throw new Error(`RATE_LIMITED: Token Grok đã bị giới hạn tạo video/ảnh. Vui lòng đợi 1h30-2h để reset hoặc thử token khác.`);
    if (resp.status === 403 || fullText.includes('Cloudflare')) throw new Error(`CF_BLOCKED: Bị chặn bởi Cloudflare.`);
    if (resp.status === 502 || resp.status === 503) throw new Error(`SERVER_ERROR: Máy chủ Grok tạm thời lỗi (${resp.status}).`);
    throw new Error(msg);
  }

  // Extract URL
  let url = result?.url || result?.data?.[0]?.url || '';
  if (url && url.startsWith('/')) url = apiBase + url;
  if (!url) {
    const content = result?.choices?.[0]?.message?.content || '';
    const m = content.match(/https?:\/\/[^\s"'<>]+\.(mp4|webm)/i);
    if (m) url = m[0];
  }
  if (!url) throw new Error('Tạo video không trả về URL.');

  // Extract reference_id for extend chaining
  // Grok2API may return: post_id (real grok.com ID), id, reference_id
  const refId = result?.post_id || result?.reference_id || result?.id || result?.data?.[0]?.id || '';

  return { url, reference_id: refId, raw: result };
}

// ─── Extend video and return full result (url + reference_id) for chaining ───
async function extendVideoFull(apiBase, cookies, prompt, referenceId, startTime, opts = {}) {
  await injectIntoGrok2API(apiBase, cookies);

  const { aspect_ratio = '16:9', video_length = 6, resolution = '480p' } = opts;

  const resp = await fetch(`${apiBase}/v1/video/extend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      reference_id: referenceId,
      start_time: parseFloat(startTime) || 0,
      ratio: aspect_ratio,
      length: video_length || 6,
      resolution: resolution || '480p',
    }),
  });

  let result;
  try { result = await resp.json(); } catch {
    try { const txt = await resp.text(); result = { _rawText: txt }; } catch { result = {}; }
  }
  const respText = JSON.stringify(result).substring(0, 500);
  if (!resp.ok || result?.error) {
    const msg = result?.error?.message || (typeof result?.detail === 'string' ? result.detail : '') || result?._rawText || `Kéo dài video thất bại (HTTP ${resp.status}): ${respText}`;
    const fullText = msg + ' ' + respText;
    const isRateLimit = resp.status === 429 || fullText.includes('rate limit') || fullText.includes('cooling') || fullText.includes('quota') || fullText.includes('Too many') || fullText.includes('Chat failed, 429') || fullText.includes('failed, 429') || fullText.includes('rate_limited');
    if (isRateLimit) throw new Error(`RATE_LIMITED: Token Grok đã bị giới hạn.`);
    if (resp.status === 403 || fullText.includes('Cloudflare')) throw new Error(`CF_BLOCKED: Bị chặn bởi Cloudflare.`);
    if (resp.status === 502 || resp.status === 503) throw new Error(`SERVER_ERROR: Máy chủ Grok tạm thời lỗi (${resp.status}).`);
    throw new Error(msg);
  }

  let url = result?.url || result?.data?.[0]?.url || '';
  if (url && url.startsWith('/')) url = apiBase + url;
  if (!url) throw new Error('Kéo dài video không trả về URL.');

  const refId = result?.post_id || result?.reference_id || result?.id || result?.data?.[0]?.id || '';
  return { url, reference_id: refId, raw: result };
}

// ─── Image→Video via Grok2API (upload image first, then /v1/videos) ───
async function generateImageVideoViaAPI(apiBase, cookies, prompt, imageUrl, opts = {}) {
  await injectIntoGrok2API(apiBase, cookies);

  const { aspect_ratio = '16:9', video_length = 6, resolution = '480p' } = opts;
  const sizeMap = { '16:9': '1280x720', '9:16': '720x1280', '1:1': '1024x1024', '3:2': '1792x1024', '2:3': '1024x1792' };

  // image_reference accepts data URI directly, no need to upload separately
  let uploadedUrl = imageUrl;

  // Use /v1/videos with image_reference parameter (Grok2API expects this)
  const resp = await fetch(`${apiBase}/v1/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      image_reference: { image_url: uploadedUrl },
      size: sizeMap[aspect_ratio] || '1280x720',
      seconds: video_length || 6,
      quality: resolution === '720p' ? 'high' : 'standard',
    }),
  });

  let result;
  try { result = await resp.json(); } catch {
    try { const txt = await resp.text(); result = { _rawText: txt }; } catch { result = {}; }
  }
  const respText = JSON.stringify(result).substring(0, 500);

  if (!resp.ok || result?.error) {
    const msg = result?.error?.message || (typeof result?.detail === 'string' ? result.detail : '') || result?._rawText || `Ảnh→Video thất bại (HTTP ${resp.status}): ${respText}`;
    const fullText = msg + ' ' + respText;
    const isRateLimit = resp.status === 429 || fullText.includes('rate limit') || fullText.includes('cooling') || fullText.includes('quota') || fullText.includes('Too many') || fullText.includes('Chat failed, 429') || fullText.includes('failed, 429') || fullText.includes('rate_limited');
    if (isRateLimit) {
      throw new Error(`RATE_LIMITED: Token Grok đã bị giới hạn tạo video/ảnh. Vui lòng đợi 1h30-2h để reset hoặc thử token khác.`);
    }
    if (resp.status === 403 || fullText.includes('Cloudflare')) {
      throw new Error(`CF_BLOCKED: Bị chặn bởi Cloudflare. Cần cập nhật cookie cf_clearance mới từ grok.com.`);
    }
    if (resp.status === 502 || resp.status === 503) {
      throw new Error(`SERVER_ERROR: Máy chủ Grok tạm thời lỗi (${resp.status}). Vui lòng thử lại sau vài phút.`);
    }
    throw new Error(msg);
  }

  // Grok2API returns: { url: "...", ... } or { data: [{ url }] }
  if (result?.url) return result.url;
  const url = result?.data?.[0]?.url;
  if (url) return url.startsWith('/') ? apiBase + url : url;

  // Fallback: extract from choices content
  const content = result?.choices?.[0]?.message?.content || '';
  const m = content.match(/https?:\/\/[^\s"'<>]+\.(mp4|webm)/i);
  if (m) return m[0];

  throw new Error('Ảnh→Video không trả về URL. Response: ' + JSON.stringify(result).substring(0, 200));
}

// ─── Extend video via Grok2API /v1/video/extend ───
async function extendVideoViaAPI(apiBase, cookies, prompt, referenceId, startTime, opts = {}) {
  await injectIntoGrok2API(apiBase, cookies);

  const { aspect_ratio = '16:9', video_length = 6, resolution = '480p' } = opts;

  const resp = await fetch(`${apiBase}/v1/video/extend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      reference_id: referenceId,
      start_time: parseFloat(startTime) || 0,
      ratio: aspect_ratio,
      length: video_length || 6,
      resolution: resolution || '480p',
    }),
  });

  let result;
  try { result = await resp.json(); } catch {
    try { const txt = await resp.text(); result = { _rawText: txt }; } catch { result = {}; }
  }
  const respText = JSON.stringify(result).substring(0, 500);
  if (!resp.ok || result?.error) {
    const msg = result?.error?.message || (typeof result?.detail === 'string' ? result.detail : '') || result?._rawText || `Kéo dài video thất bại (HTTP ${resp.status}): ${respText}`;
    const fullText = msg + ' ' + respText;
    const isRateLimit = resp.status === 429 || fullText.includes('rate limit') || fullText.includes('cooling') || fullText.includes('quota') || fullText.includes('Too many') || fullText.includes('Chat failed, 429') || fullText.includes('failed, 429') || fullText.includes('rate_limited');
    if (isRateLimit) {
      throw new Error(`RATE_LIMITED: Token Grok đã bị giới hạn. Vui lòng đợi 1h30-2h để reset hoặc thử token khác.`);
    }
    if (resp.status === 403 || fullText.includes('Cloudflare')) {
      throw new Error(`CF_BLOCKED: Bị chặn bởi Cloudflare. Cần cập nhật cookie cf_clearance mới từ grok.com.`);
    }
    if (resp.status === 502 || resp.status === 503) {
      throw new Error(`SERVER_ERROR: Máy chủ Grok tạm thời lỗi (${resp.status}). Vui lòng thử lại sau vài phút.`);
    }
    throw new Error(msg);
  }

  if (result?.url) return result.url;
  const url = result?.data?.[0]?.url;
  if (url) return url.startsWith('/') ? apiBase + url : url;

  throw new Error('Kéo dài video không trả về URL.');
}

// ─── Image generation via Grok2API /v1/images/generations (WebSocket, no CF) ───
async function generateImageViaAPI(apiBase, cookies, prompt, opts = {}) {
  await injectIntoGrok2API(apiBase, cookies);

  const { size = '1024x1024', n = 1 } = opts;

  const resp = await fetch(`${apiBase}/v1/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, n, size, model: 'grok-imagine-1.0' }),
  });

  let result;
  try { result = await resp.json(); } catch { result = {}; }
  const respText = JSON.stringify(result).substring(0, 500);
  if (!resp.ok || result?.error) {
    const msg = result?.error?.message || (typeof result?.detail === 'string' ? result.detail : '') || result?._rawText || `Tạo ảnh thất bại (HTTP ${resp.status}): ${respText}`;
    const fullText = msg + ' ' + respText;
    const isRateLimit = resp.status === 429 || fullText.includes('rate limit') || fullText.includes('cooling') || fullText.includes('quota') || fullText.includes('Too many') || fullText.includes('Chat failed, 429') || fullText.includes('failed, 429') || fullText.includes('rate_limited');
    if (isRateLimit) {
      throw new Error(`RATE_LIMITED: Token Grok đã bị giới hạn tạo ảnh. Vui lòng đợi 1h30-2h để reset hoặc thử token khác.`);
    }
    if (resp.status === 403 || fullText.includes('Cloudflare')) {
      throw new Error(`CF_BLOCKED: Bị chặn bởi Cloudflare. Cần cập nhật cookie cf_clearance mới từ grok.com.`);
    }
    if (resp.status === 502 || resp.status === 503) {
      throw new Error(`SERVER_ERROR: Máy chủ Grok tạm thời lỗi (${resp.status}). Vui lòng thử lại sau vài phút.`);
    }
    throw new Error(msg);
  }

  const url = result?.data?.[0]?.url;
  if (url) return url.startsWith('/') ? apiBase + url : url;
  if (result?.data?.[0]?.b64_json) return `data:image/png;base64,${result.data[0].b64_json}`;
  throw new Error('Tạo ảnh không trả về kết quả');
}

// ─── Image edit via Grok2API /v1/images/edits ───
async function editImageViaAPI(apiBase, cookies, prompt, imageUrl, opts = {}) {
  await injectIntoGrok2API(apiBase, cookies);

  const { size = '1024x1024', n = 1 } = opts;

  const resp = await fetch(`${apiBase}/v1/images/edits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image: imageUrl, n, size, model: 'grok-imagine-1.0-edit' }),
  });

  let result;
  try { result = await resp.json(); } catch { result = {}; }
  const respText = JSON.stringify(result).substring(0, 500);
  if (!resp.ok || result?.error) {
    const msg = result?.error?.message || (typeof result?.detail === 'string' ? result.detail : '') || result?._rawText || `Chỉnh sửa ảnh thất bại (HTTP ${resp.status}): ${respText}`;
    const fullText = msg + ' ' + respText;
    const isRateLimit = resp.status === 429 || fullText.includes('rate limit') || fullText.includes('cooling') || fullText.includes('quota') || fullText.includes('Too many') || fullText.includes('Chat failed, 429') || fullText.includes('failed, 429') || fullText.includes('rate_limited');
    if (isRateLimit) {
      throw new Error(`RATE_LIMITED: Token Grok đã bị giới hạn. Vui lòng đợi 1h30-2h để reset hoặc thử token khác.`);
    }
    if (resp.status === 403 || fullText.includes('Cloudflare')) {
      throw new Error(`CF_BLOCKED: Bị chặn bởi Cloudflare. Cần cập nhật cookie cf_clearance mới từ grok.com.`);
    }
    if (resp.status === 502 || resp.status === 503) {
      throw new Error(`SERVER_ERROR: Máy chủ Grok tạm thời lỗi (${resp.status}). Vui lòng thử lại sau vài phút.`);
    }
    throw new Error(msg);
  }

  const url = result?.data?.[0]?.url;
  if (url) return url.startsWith('/') ? apiBase + url : url;
  if (result?.data?.[0]?.b64_json) return `data:image/png;base64,${result.data[0].b64_json}`;
  throw new Error('Chỉnh sửa ảnh không trả về kết quả');
}

// ─── Main handler ───
export async function handleGenerate(request, env, user) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Phương thức không hỗ trợ' }, 405);
  const userId = user.sub;
  const body = await request.json();
  const apiBase = env.GROK_API_BASE;

  if (!apiBase) {
    return jsonResponse({ error: 'GROK_API_BASE chưa được cấu hình.' }, 500);
  }

  // ── Diagnostic endpoint ──
  if (body.type === 'diagnose') {
    const account = await getRandomToken(env, userId);
    if (!account) {
      return jsonResponse({ hasAccount: false, apiReachable: false, hint: 'Chưa có tài khoản Grok. Thêm token trong phần Cài Đặt Token.' });
    }
    const cookies = parseCookies(account.sso_token);

    // Test Grok2API reachability
    let apiOk = false;
    let apiError = '';
    try {
      const t = await fetch(`${apiBase}/v1/admin/verify`, {
        headers: { 'Authorization': `Bearer ${GROK2API_KEY}` },
      });
      apiOk = t.status === 200;
      if (!apiOk) apiError = `HTTP ${t.status}`;
    } catch (e) {
      apiError = e.message;
    }

    return jsonResponse({
      hasAccount: true,
      hasSso: !!cookies.sso,
      hasCfClearance: !!cookies.cfClearance,
      hasCfBm: !!cookies.cfBm,
      apiReachable: apiOk,
      apiBase,
      hint: !apiOk
        ? `Không kết nối được Grok2API tại ${apiBase}. Lỗi: ${apiError}. Kiểm tra Grok2API đang chạy chưa.`
        : !cookies.cfClearance
          ? 'Đã kết nối Grok2API. Cảnh báo: cookie thiếu cf_clearance — tạo video có thể lỗi. Hãy export lại cookie sau khi giải CF challenge trên grok.com.'
          : 'Tất cả OK. Grok2API đã kết nối, cookie có cf_clearance.',
    });
  }

  const { type, prompt, image_url, reference_id, start_time, aspect_ratio, video_length, resolution, size, n, account_id, session_id, session_name } = body;
  if (!type || !prompt) return jsonResponse({ error: 'Thiếu loại hoặc prompt' }, 400);

  const allowed = await checkFeature(env, userId, type);
  if (!allowed) return jsonResponse({ error: 'Tính năng này không khả dụng trên gói của bạn.' }, 403);
  if (!(await checkCredits(env, userId))) return jsonResponse({ error: 'Đã hết lượt sử dụng.' }, 403);

  const dailyCheck = await checkDailyLimit(env, userId, type);
  if (!dailyCheck.ok) return jsonResponse({ error: dailyCheck.msg, daily_limit: true }, 429);

  // If account_id specified, use that specific account; otherwise random
  let account;
  if (account_id) {
    account = await env.DB.prepare(
      "SELECT id, sso_token FROM grok_accounts WHERE id = ? AND user_id = ? AND status = 'active'"
    ).bind(account_id, userId).first() || null;
    if (!account) {
      // Try limited accounts that have cooled down (> 2 hours)
      const cooled = await env.DB.prepare(
        "SELECT id, sso_token FROM grok_accounts WHERE id = ? AND user_id = ? AND status = 'limited' AND limited_at <= datetime('now', '-2 hours')"
      ).bind(account_id, userId).first();
      if (cooled) {
        await env.DB.prepare("UPDATE grok_accounts SET status = 'active', limited_at = NULL WHERE id = ?").bind(cooled.id).run();
        account = cooled;
      } else {
        // Fallback to any active account
        account = await getRandomToken(env, userId);
      }
    }
  } else {
    account = await getRandomToken(env, userId);
  }
  if (!account) {
    // Check if there are limited accounts
    const limitedCount = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM grok_accounts WHERE user_id = ? AND status = 'limited'"
    ).bind(userId).first();
    if (limitedCount?.cnt > 0) {
      return jsonResponse({
        error: `⛔ Tất cả ${limitedCount.cnt} token Grok đều đang bị khóa (rate limit). Token sẽ tự mở khóa sau 1h30-2h. Thêm tài khoản Grok mới hoặc đợi.`,
        all_limited: true,
        token_cooling: true,
      }, 429);
    }
    return jsonResponse({ error: 'Chưa có tài khoản Grok. Thêm token trong phần Tài khoản.' }, 400);
  }

  const histResult = await env.DB.prepare(
    "INSERT INTO history (user_id, type, prompt, input_url, status, session_id, session_name) VALUES (?, ?, ?, ?, 'processing', ?, ?)"
  ).bind(userId, type, prompt, image_url || null, session_id || null, session_name || null).run();
  const historyId = histResult.meta.last_row_id;

  const cookies = parseCookies(account.sso_token);
  if (!cookies.sso) {
    await env.DB.prepare("UPDATE grok_accounts SET status = 'invalid' WHERE id = ?").bind(account.id).run();
    await env.DB.prepare("UPDATE history SET status = 'failed' WHERE id = ?").bind(historyId).run();
    return jsonResponse({ error: 'Cookie không hợp lệ — không tìm thấy SSO token. Hãy thêm lại cookie.' }, 400);
  }

  try {
    let outputUrl = '';

    switch (type) {
      case 'text2video':
        outputUrl = await generateVideoViaAPI(apiBase, cookies, prompt, { aspect_ratio, video_length: video_length || 6, resolution: resolution || '480p' });
        break;

      case 'image2video':
        if (!image_url) throw new Error('Vui lòng tải ảnh lên trước');
        outputUrl = await generateImageVideoViaAPI(apiBase, cookies, prompt, image_url, { aspect_ratio, video_length: video_length || 6, resolution: resolution || '480p' });
        break;

      case 'text2image':
        outputUrl = await generateImageViaAPI(apiBase, cookies, prompt, { size, n });
        break;

      case 'image2image':
        if (!image_url) throw new Error('Vui lòng tải ảnh lên trước');
        outputUrl = await editImageViaAPI(apiBase, cookies, prompt, image_url, { size, n });
        break;

      case 'extend_video':
        if (!reference_id) throw new Error('Thiếu Reference ID');
        outputUrl = await extendVideoViaAPI(apiBase, cookies, prompt, reference_id, start_time || 0, { aspect_ratio, video_length: video_length || 6, resolution: resolution || '480p' });
        break;

      default:
        return jsonResponse({ error: 'Loại không hợp lệ' }, 400);
    }

    if (!outputUrl) {
      await env.DB.prepare("UPDATE history SET status = 'failed', metadata = '{}' WHERE id = ?").bind(historyId).run();
      return jsonResponse({ error: 'Tạo không trả về kết quả.' }, 502);
    }

    // Save to R2 for permanent storage (Grok deletes files after a few hours)
    let permanentUrl = outputUrl;
    if (env.MEDIA) {
      const r2Url = await saveToR2(env, outputUrl, type, historyId);
      if (r2Url) permanentUrl = r2Url;
    }

    await env.DB.prepare(
      "UPDATE history SET status = 'completed', output_url = ?, completed_at = datetime('now') WHERE id = ?"
    ).bind(permanentUrl, historyId).run();
    await deductCredit(env, userId);
    await env.DB.prepare("UPDATE grok_accounts SET last_used = datetime('now') WHERE id = ? AND user_id = ?").bind(account.id, userId).run();

    return jsonResponse({ success: true, historyId, outputUrl: permanentUrl, accountId: account.id });

  } catch (err) {
    const msg = err.message || 'Unknown error';
    try {
      if (historyId) {
        await env.DB.prepare("UPDATE history SET status = 'failed', metadata = ? WHERE id = ?")
          .bind(JSON.stringify({ error: msg }), historyId).run();
      }
    } catch (dbErr) {
      console.error('Failed to update history:', dbErr.message);
    }

    if (msg.startsWith('CF_BLOCKED')) {
      return jsonResponse({
        error: 'Bị chặn bởi Cloudflare (403). Cookie cần có cf_clearance.\n1. Mở grok.com trên Chrome\n2. Giải CF challenge\n3. Export tất cả cookie (bao gồm cf_clearance)\n4. Cập nhật lại cookie mới',
        cf_blocked: true,
      }, 502);
    }

    // Rate limit / quota — check BEFORE network errors (502 from Grok2API can mean rate limit)
    const isRateLimit = msg.startsWith('RATE_LIMITED') || msg.includes('429') || msg.includes('rate limit')
      || msg.includes('Too many requests') || msg.includes('quota exceeded') || msg.includes('cooling')
      || msg.includes('quota') || msg.includes('Chat failed, 429');
    if (isRateLimit) {
      // Mark this account as limited in DB with timestamp
      if (account_id || account?.id) {
        const accId = account_id || account.id;
        try {
          await env.DB.prepare("UPDATE grok_accounts SET status = 'limited', limited_at = datetime('now') WHERE id = ? AND user_id = ?").bind(accId, userId).run();
        } catch {}
      }
      // Check how many active accounts remain
      const remaining = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM grok_accounts WHERE user_id = ? AND status = 'active'"
      ).bind(userId).first();
      const allLimited = (remaining?.cnt || 0) === 0;
      return jsonResponse({
        error: allLimited
          ? '⛔ Tất cả token Grok đều đã bị giới hạn (rate limit từ Grok.com). Token sẽ tự mở khóa sau 1h30-2h. Thêm tài khoản Grok mới để tiếp tục.'
          : `⚠️ Token Grok #${account?.id} đã bị giới hạn (rate limit từ Grok.com). Còn ${remaining.cnt} token khác đang hoạt động — hệ thống sẽ tự chuyển sang token khác nhưng tốc độ có thể chậm hơn.`,
        token_rate_limited: true,
        account_id: account?.id || null,
        all_limited: allLimited,
        remaining_active: remaining?.cnt || 0,
      }, 429);
    }

    // No available tokens in Grok2API pool — all tokens cooling
    if (msg.includes('No available token')) {
      return jsonResponse({
        error: '⛔ Tất cả token Grok đang bị giới hạn (cooling). Token sẽ tự mở khóa sau 1h30-2h. Thêm tài khoản Grok mới hoặc đợi.',
        token_cooling: true,
        all_limited: true,
      }, 429);
    }

    // Network / tunnel errors — only for REAL connection failures
    const isNetworkError = msg.includes('fetch failed') || msg.includes('network')
      || msg.includes('ECONNREFUSED') || msg.includes('socket') || msg.includes('timeout') || msg.includes('abort')
      || msg.includes('DNS') || msg.includes('Connection refused') || msg.includes('ENOTFOUND')
      || msg.includes('unreachable');
    if (isNetworkError) {
      return jsonResponse({
        error: `Không kết nối được Grok2API (${apiBase}). Tunnel có thể đang bị đứt. Kiểm tra VPS và cloudflared.`,
        tunnel_error: true,
      }, 502);
    }

    // Transient server errors (502/503 from Grok2API) — retryable
    if (msg.startsWith('SERVER_ERROR')) {
      return jsonResponse({
        error: `Grok2API trả lỗi tạm thời. Hệ thống sẽ tự thử lại.`,
        server_error: true,
        retryable: true,
      }, 502);
    }

    // Actual quota / rate limit errors (fallback)
    if (msg.includes('rate limit') || msg.includes('Too many requests') || msg.includes('quota exceeded')) {
      return jsonResponse({ error: 'Tài khoản Grok đã hết quota. Quota tự reset sau vài giờ, hoặc thêm tài khoản Grok mới.', quota_exhausted: true }, 429);
    }

    return jsonResponse({ error: `Tạo thất bại: ${msg}` }, 500);
  }
}

// ─── Video Project: chain gen + extend to create long video ───
export async function handleVideoProject(request, env, user, ctx) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Phương thức không hỗ trợ' }, 405);
  try {
  const userId = user.sub;
  const body = await request.json();
  const apiBase = env.GROK_API_BASE;
  if (!apiBase) return jsonResponse({ error: 'GROK_API_BASE chưa cấu hình' }, 500);

  const { prompts, aspect_ratio = '16:9', video_length = 6, resolution = '480p', session_id, session_name, reference_id, start_time } = body;
  if (!Array.isArray(prompts) || prompts.length < 1) return jsonResponse({ error: 'Cần ít nhất 1 prompt' }, 400);
  if (!reference_id && prompts.length < 2) return jsonResponse({ error: 'Cần ít nhất 2 prompt (hoặc cung cấp reference_id để extend)' }, 400);

  // Max clips: 30s total / video_length per clip
  const len = parseInt(video_length) || 6;
  const maxClips = Math.floor(30 / len);
  const clips = prompts.slice(0, maxClips);

  // Check credits
  if (!(await checkCredits(env, userId))) return jsonResponse({ error: 'Đã hết lượt sử dụng.' }, 403);
  const allowed = await checkFeature(env, userId, 'text2video');
  if (!allowed) return jsonResponse({ error: 'Tính năng này không khả dụng trên gói của bạn.' }, 403);

  // Get all active tokens for rotation
  const allTokens = await env.DB.prepare(
    "SELECT id, sso_token FROM grok_accounts WHERE user_id = ? AND status = 'active' ORDER BY RANDOM()"
  ).bind(userId).all();
  let tokens = allTokens?.results || [];

  // Also try cooled tokens
  if (tokens.length === 0) {
    const cooled = await env.DB.prepare(
      "SELECT id, sso_token FROM grok_accounts WHERE user_id = ? AND status = 'limited' AND limited_at <= datetime('now', '-2 hours') ORDER BY RANDOM()"
    ).bind(userId).all();
    tokens = cooled?.results || [];
    for (const t of tokens) {
      await env.DB.prepare("UPDATE grok_accounts SET status = 'active', limited_at = NULL WHERE id = ?").bind(t.id).run();
    }
  }
  if (tokens.length === 0) return jsonResponse({ error: 'Chưa có token Grok hoạt động.' }, 400);

  // Create history entry for the project
  const histResult = await env.DB.prepare(
    "INSERT INTO history (user_id, type, prompt, status, session_id, session_name) VALUES (?, 'text2video', ?, 'processing', ?, ?)"
  ).bind(userId, clips.join('\n---\n'), session_id || null, session_name || null).run();
  const historyId = histResult.meta.last_row_id;

  // SSE stream for progress
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const send = (data) => writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`));

  // Process chain in background
  const processChain = async () => {
    let tokenIdx = 0;
    const getNextToken = () => {
      const t = tokens[tokenIdx % tokens.length];
      tokenIdx++;
      return t;
    };

    let lastRefId = reference_id || '';
    let lastUrl = '';
    let totalTime = (reference_id && start_time) ? (parseFloat(start_time) || 0) : 0;
    const results = [];
    let writerClosed = false;
    const safeSend = async (data) => {
      if (writerClosed) return;
      try { await writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch (e) { console.error('SSE write error:', e.message); }
    };
    const safeClose = async () => {
      if (writerClosed) return;
      writerClosed = true;
      try { await writer.close(); } catch {}
    };

    try {
      for (let i = 0; i < clips.length; i++) {
        const clipPrompt = clips[i].trim();
        if (!clipPrompt) continue;

        const token = getNextToken();
        const cookies = parseCookies(token.sso_token);
        if (!cookies.sso) {
          await safeSend({ step: i + 1, total: clips.length, status: 'error', error: `Token #${token.id} không hợp lệ, bỏ qua` });
          continue;
        }

        await safeSend({ step: i + 1, total: clips.length, status: 'processing', prompt: clipPrompt.substring(0, 50) });

        try {
          let res;
          if (i === 0 && !reference_id) {
            // First clip without reference: generate new video
            res = await generateVideoFull(apiBase, cookies, clipPrompt, { aspect_ratio, video_length: len, resolution });
          } else {
            // Extend from previous clip or from provided reference_id
            const refId = (i === 0 && reference_id) ? reference_id : lastRefId;
            const st = (i === 0 && reference_id) ? (parseFloat(start_time) || 0) : totalTime;
            if (!refId) {
              await safeSend({ step: i + 1, total: clips.length, status: 'error', error: 'Không có reference_id từ clip trước. Dừng project.' });
              break;
            }
            res = await extendVideoFull(apiBase, cookies, clipPrompt, refId, st, { aspect_ratio, video_length: len, resolution });
          }

          lastUrl = res.url;
          lastRefId = res.reference_id || lastRefId;
          totalTime += len;
          results.push({ step: i + 1, url: res.url, reference_id: res.reference_id });

          await safeSend({ step: i + 1, total: clips.length, status: 'done', url: res.url, reference_id: res.reference_id, duration: totalTime });

        } catch (err) {
          const msg = err.message || '';
          // Mark token as limited if rate limited
          if (msg.startsWith('RATE_LIMITED') || msg.includes('429')) {
            try {
              await env.DB.prepare("UPDATE grok_accounts SET status = 'limited', limited_at = datetime('now') WHERE id = ? AND user_id = ?").bind(token.id, userId).run();
            } catch {}
            // Remove from rotation
            tokens = tokens.filter(t => t.id !== token.id);
            if (tokens.length === 0) {
              await safeSend({ step: i + 1, total: clips.length, status: 'error', error: 'Tất cả token đã bị giới hạn. Dừng project.' });
              break;
            }
            // Retry this clip with next token
            i--;
            await safeSend({ step: i + 2, total: clips.length, status: 'retry', error: `Token #${token.id} bị limit, thử token khác...` });
            continue;
          }

          await safeSend({ step: i + 1, total: clips.length, status: 'error', error: msg.substring(0, 200) });
          // For server errors, retry once
          if (msg.startsWith('SERVER_ERROR') && !clips[i]._retried) {
            clips[i] = { toString: () => clipPrompt, _retried: true, trim: () => clipPrompt };
            i--;
            continue;
          }
          break;
        }
      }

      // Save final video to R2
      if (lastUrl) {
        let permanentUrl = lastUrl;
        if (env.MEDIA) {
          const r2Url = await saveToR2(env, lastUrl, 'video_project', historyId);
          if (r2Url) permanentUrl = r2Url;
        }
        await env.DB.prepare(
          "UPDATE history SET status = 'completed', output_url = ?, completed_at = datetime('now'), metadata = ? WHERE id = ?"
        ).bind(permanentUrl, JSON.stringify({ clips: results.length, duration: totalTime, steps: results }), historyId).run();
        await deductCredit(env, userId);
        await safeSend({ status: 'completed', url: permanentUrl, historyId, clips: results.length, duration: totalTime });
      } else {
        await env.DB.prepare("UPDATE history SET status = 'failed', metadata = ? WHERE id = ?")
          .bind(JSON.stringify({ error: 'Không tạo được clip nào' }), historyId).run();
        await safeSend({ status: 'failed', error: 'Không tạo được clip nào' });
      }
    } catch (e) {
      try {
        await env.DB.prepare("UPDATE history SET status = 'failed', metadata = ? WHERE id = ?")
          .bind(JSON.stringify({ error: e.message }), historyId).run();
      } catch {}
      await safeSend({ status: 'failed', error: e.message });
    } finally {
      await safeSend({ status: 'done_stream' });
      await safeClose();
    }
  };

  // Start processing (don't await — stream response immediately)
  const chainPromise = processChain().catch(e => console.error('processChain unhandled:', e.message));
  if (ctx && ctx.waitUntil) ctx.waitUntil(chainPromise);

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
  } catch (e) {
    console.error('handleVideoProject crash:', e.message, e.stack);
    return jsonResponse({ error: 'Video Project lỗi: ' + e.message }, 500);
  }
}

