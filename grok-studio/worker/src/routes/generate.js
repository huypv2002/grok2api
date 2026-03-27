import { jsonResponse } from '../utils/response.js';

const GROK2API_KEY = 'grok2api';
const GROK_BASE = 'https://grok.com';
const CF_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

// ── Delay helper ──
function randomDelay(minMs = 2000, maxMs = 3000) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs));
}

// ── Rate limit detection ──
function isGrokRateLimit(status, text) {
  const t = (text || '').toLowerCase();
  return status === 429 ||
    t.includes('too many requests') || t.includes('chat failed, 429') ||
    t.includes('failed, 429') || t.includes('cooling down') ||
    t.includes('rate limit reached') || t.includes('you have reached') ||
    (t.includes('please wait') && t.includes('try again')) ||
    t.includes('exceeded your') ||
    (t.includes('limit exceeded') && !t.includes('rate_limit_exceeded'));
}

// ── Save to R2 ──
async function saveToR2(env, outputUrl, type, historyId) {
  try {
    const isVideo = type.includes('video') || type === 'extend_video';
    const resp = await fetch(outputUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!resp.ok) return null;
    const contentType = resp.headers.get('content-type') || (isVideo ? 'video/mp4' : 'image/png');
    let ext = isVideo ? 'mp4' : 'png';
    if (!isVideo) {
      if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
      else if (contentType.includes('webp')) ext = 'webp';
    }
    const key = `media/${historyId}.${ext}`;
    await env.MEDIA.put(key, resp.body, { httpMetadata: { contentType } });
    return `/api/media/${key}`;
  } catch (e) {
    console.error('R2 save failed:', e.message);
    return null;
  }
}

// ── Upload base64 data URL to R2, return public URL ──
async function uploadBase64ToR2(env, dataUrl, appBase) {
  try {
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return dataUrl; // not base64, return as-is
    const contentType = m[1];
    const b64 = m[2];
    const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    let ext = 'jpg';
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('webp')) ext = 'webp';
    const key = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    await env.MEDIA.put(key, binary, { httpMetadata: { contentType } });
    return `${appBase}/api/media/${key}`;
  } catch (e) {
    console.error('uploadBase64ToR2 failed:', e.message);
    return dataUrl;
  }
}

// ── DB helpers ──
async function getRandomToken(env, userId) {
  const active = await env.DB.prepare(
    "SELECT id, sso_token FROM grok_accounts WHERE user_id = ? AND status = 'active' ORDER BY RANDOM() LIMIT 1"
  ).bind(userId).first();
  if (active) return active;
  const cooled = await env.DB.prepare(
    "SELECT id, sso_token FROM grok_accounts WHERE user_id = ? AND status = 'limited' AND limited_at <= datetime('now', '-2 hours') ORDER BY RANDOM() LIMIT 1"
  ).bind(userId).first();
  if (cooled) {
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
  if (u.plan_expires) {
    const now = new Date().toISOString().slice(0, 10);
    if (now > u.plan_expires) return { ok: false, msg: `Gói đã hết hạn (${u.plan_expires}). Liên hệ admin để gia hạn.`, expired: true };
  }
  const p = await env.DB.prepare('SELECT daily_limit, video_limit FROM plans WHERE id = ?').bind(u.plan).first();
  const effectiveDaily = (u.daily_limit !== null && u.daily_limit !== -1) ? u.daily_limit : (p?.daily_limit ?? -1);
  const effectiveVideo = (u.video_limit !== null && u.video_limit !== -1) ? u.video_limit : (p?.video_limit ?? -1);
  if (effectiveDaily > 0) {
    const today = await env.DB.prepare("SELECT COUNT(*) as cnt FROM history WHERE user_id = ? AND created_at >= date('now')").bind(userId).first();
    if (today.cnt >= effectiveDaily) return { ok: false, msg: `Đã đạt giới hạn ${effectiveDaily} lượt/ngày. Nâng cấp gói để tạo thêm.` };
  }
  const isVideo = ['text2video', 'image2video', 'extend_video'].includes(type);
  if (isVideo && effectiveVideo > 0) {
    const todayVid = await env.DB.prepare("SELECT COUNT(*) as cnt FROM history WHERE user_id = ? AND created_at >= date('now') AND type IN ('text2video','image2video','extend_video')").bind(userId).first();
    if (todayVid.cnt >= effectiveVideo) return { ok: false, msg: `Đã đạt giới hạn ${effectiveVideo} video/ngày. Nâng cấp gói để tạo thêm.` };
  }
  return { ok: true };
}
async function deductCredit(env, userId) {
  await env.DB.prepare("UPDATE users SET credits = MAX(0, credits - 1), updated_at = datetime('now') WHERE id = ? AND credits > 0 AND plan != 'unlimited' AND role NOT IN ('admin','superadmin')").bind(userId).run();
}
async function checkFeature(env, userId, feature) {
  const u = await env.DB.prepare('SELECT plan, role FROM users WHERE id = ?').bind(userId).first();
  if (u.role === 'admin' || u.role === 'superadmin') return true;
  const p = await env.DB.prepare('SELECT features FROM plans WHERE id = ?').bind(u.plan).first();
  if (!p) return true;
  return !!JSON.parse(p.features || '{}')[feature];
}

// ── Cookie parsing ──
function parseCookies(rawInput) {
  const r = { sso: '', ssoRw: '', cookieStr: '', cfClearance: '', cfBm: '' };
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
  if (rawInput.includes('name:') && rawInput.includes('value:')) {
    const blocks = rawInput.split(/\},?\s*\{/).map(s => s.replace(/[\[\]{}]/g, ''));
    for (const block of blocks) {
      const nm = block.match(/(?:^|,)name:([^,}]+)/);
      const vm = block.match(/(?:^|,)value:([^,}]+)/);
      if (nm && vm) {
        const name = nm[1].trim(), value = vm[1].trim();
        if (name === 'sso') r.sso = value;
        if (name === 'sso-rw') r.ssoRw = value;
        if (name === 'cf_clearance') r.cfClearance = value;
        if (name === '__cf_bm') r.cfBm = value;
      }
    }
    if (r.sso) {
      if (!r.ssoRw) r.ssoRw = r.sso;
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

// ── Build Grok.com request headers ──
function grokHeaders(cookies) {
  return {
    'Content-Type': 'application/json',
    'Cookie': cookies.cookieStr,
    'User-Agent': CF_USER_AGENT,
    'Origin': 'https://grok.com',
    'Referer': 'https://grok.com/',
    'x-anonuserid': '',
    'x-challenge': '',
    'x-signature': '',
  };
}

// ════════════════════════════════════════════════════════════════
// MODE 1: DIRECT REQUEST — gọi thẳng grok.com API
// ════════════════════════════════════════════════════════════════

// ── Direct: tạo media post (cần trước khi gen video) ──
async function directCreateMediaPost(cookies, mediaType = 'MEDIA_POST_TYPE_VIDEO', prompt = '', mediaUrl = '') {
  const body = {
    mediaType,
    prompt: mediaType === 'MEDIA_POST_TYPE_VIDEO' ? prompt : '',
    mediaUrl: mediaUrl || '',
  };
  const resp = await fetch(`${GROK_BASE}/api/rpc/media-post/create`, {
    method: 'POST',
    headers: grokHeaders(cookies),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    if (isGrokRateLimit(resp.status, txt)) throw new Error('RATE_LIMITED: Token bị giới hạn tạm thời');
    if (resp.status === 403) throw new Error('CF_BLOCKED: Cần cập nhật cookie cf_clearance');
    throw new Error(`Tạo media post thất bại (${resp.status}): ${txt.substring(0, 200)}`);
  }
  const data = await resp.json();
  const postId = data?.post?.id || data?.postId || data?.id || '';
  if (!postId) throw new Error('Không lấy được post_id từ Grok');
  return postId;
}

// ── Direct: stream video generation và lấy URL từ SSE ──
async function directStreamVideo(cookies, message, modelConfigOverride, timeoutMs = 180000) {
  const body = {
    message,
    modelName: 'grok-3',
    toolOverrides: { videoGen: true },
    modelConfigOverride,
    isReasoning: false,
    returnImageBytes: false,
    returnRawGrokInXaiRequest: false,
    sendFinalMetadata: false,
    temporary: false,
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let resp;
  try {
    resp = await fetch(`${GROK_BASE}/api/rpc/chat/create-response`, {
      method: 'POST',
      headers: grokHeaders(cookies),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    if (isGrokRateLimit(resp.status, txt)) throw new Error('RATE_LIMITED: Token bị giới hạn tạm thời');
    if (resp.status === 403) throw new Error('CF_BLOCKED: Cần cập nhật cookie cf_clearance');
    throw new Error(`Grok stream thất bại (${resp.status}): ${txt.substring(0, 200)}`);
  }

  // Parse SSE stream to extract video URL and post_id
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let videoUrl = '', postId = '', buf = '';
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;
      try {
        const payload = JSON.parse(trimmed);
        const resp2 = payload?.result?.response;
        if (!resp2) continue;
        // Extract video URL + post_id from streamingVideoGenerationResponse
        const vr = resp2?.streamingVideoGenerationResponse;
        if (vr?.videoUrl) videoUrl = vr.videoUrl;
        if (vr?.videoPostId) postId = vr.videoPostId;
        if (vr?.postId) postId = postId || vr.postId;
        // Extract post_id from post object (highest priority — actual video post)
        const post = resp2?.post;
        if (post?.id) postId = post.id;
        // fileAttachments: only use if it looks like a UUID (not a URL)
        const fa = resp2?.modelResponse?.fileAttachments;
        if (Array.isArray(fa) && fa[0] && typeof fa[0] === 'string' && !fa[0].startsWith('http')) {
          postId = postId || fa[0];
        }
      } catch {}
    }
  }
  await reader.cancel().catch(() => {});

  // Fallback: extract post_id from video URL pattern /generated/UUID/
  if (!postId && videoUrl) {
    const m = videoUrl.match(/\/generated\/([0-9a-f-]{32,36})\//i);
    if (m) postId = m[1];
  }

  console.log(`[directStreamVideo] videoUrl=${videoUrl ? 'OK' : 'MISSING'} postId=${postId || 'MISSING'}`);
  if (!videoUrl) throw new Error('Direct stream không trả về video URL');
  return { videoUrl, postId };
}

// ── Direct: tạo video text2video ──
async function directGenerateVideo(cookies, prompt, opts = {}) {
  const { aspect_ratio = '16:9', video_length = 6, resolution = '480p', preset = 'normal' } = opts;
  const postId = await directCreateMediaPost(cookies, 'MEDIA_POST_TYPE_VIDEO', prompt);
  const modeMap = { fun: '--mode=extremely-crazy', normal: '--mode=normal', spicy: '--mode=extremely-spicy-or-crazy' };
  const message = `${prompt} ${modeMap[preset] || '--mode=normal'}`.trim();
  const modelConfig = {
    modelMap: {
      videoGenModelConfig: {
        aspectRatio: aspect_ratio,
        parentPostId: postId,
        resolutionName: resolution,
        videoLength: parseInt(video_length) || 6,
      }
    }
  };
  const { videoUrl, postId: resultPostId } = await directStreamVideo(cookies, message, modelConfig);
  return { url: videoUrl, reference_id: resultPostId || postId };
}

// ── Direct: tạo video image2video ──
async function directGenerateImageVideo(cookies, prompt, imageUrl, opts = {}) {
  const { aspect_ratio = '16:9', video_length = 6, resolution = '480p' } = opts;
  const postId = await directCreateMediaPost(cookies, 'MEDIA_POST_TYPE_IMAGE', '', imageUrl);
  const message = `${prompt} --mode=normal`.trim();
  const modelConfig = {
    modelMap: {
      videoGenModelConfig: {
        aspectRatio: aspect_ratio,
        parentPostId: postId,
        resolutionName: resolution,
        videoLength: parseInt(video_length) || 6,
      }
    }
  };
  const { videoUrl, postId: resultPostId } = await directStreamVideo(cookies, message, modelConfig);
  return { url: videoUrl, reference_id: resultPostId || postId };
}

// ── Direct: conversations/new endpoint (dùng cho extend video) ──
// Endpoint này dùng SSE format khác với /api/rpc/chat/create-response
async function directConversationNew(cookies, body, timeoutMs = 180000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let resp;
  try {
    resp = await fetch(`${GROK_BASE}/rest/app-chat/conversations/new`, {
      method: 'POST',
      headers: grokHeaders(cookies),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    if (isGrokRateLimit(resp.status, txt)) throw new Error('RATE_LIMITED: Token bị giới hạn tạm thời');
    if (resp.status === 403) throw new Error('CF_BLOCKED: Cần cập nhật cookie cf_clearance');
    throw new Error(`Grok conversations/new thất bại (${resp.status}): ${txt.substring(0, 200)}`);
  }

  // Parse SSE stream — format: "data: {...}\n\n"
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let videoUrl = '', postId = '', buf = '';
  const deadline = Date.now() + timeoutMs;
  // Debug: capture first 3000 chars of raw stream
  let rawDebug = '', rawCaptured = false;

  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    buf += chunk;
    if (!rawCaptured) {
      rawDebug += chunk;
      if (rawDebug.length >= 3000) rawCaptured = true;
    }
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      // Format: "data: {...}" hoặc raw JSON
      const jsonStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
      if (!jsonStr || !jsonStr.startsWith('{')) continue;
      try {
        const payload = JSON.parse(jsonStr);
        // conversations/new trả về result.response hoặc trực tiếp
        const r = payload?.result?.response || payload?.response || payload;
        // Extract video URL từ streamingVideoGenerationResponse
        const vr = r?.streamingVideoGenerationResponse;
        if (vr?.videoUrl) videoUrl = vr.videoUrl;
        if (vr?.videoPostId) postId = vr.videoPostId;
        if (vr?.postId) postId = vr.postId;
        // Fallback: modelResponse
        const mr = r?.modelResponse;
        if (mr?.videoUrl) videoUrl = videoUrl || mr.videoUrl;
        // post object
        const post = r?.post;
        if (post?.id) postId = postId || post.id;
        // Deep search: tìm videoUrl ở bất kỳ đâu trong payload
        const payloadStr = JSON.stringify(payload);
        if (!videoUrl) {
          const m = payloadStr.match(/"videoUrl"\s*:\s*"([^"]+)"/);
          if (m) videoUrl = m[1];
        }
        if (!postId) {
          const m2 = payloadStr.match(/"(?:videoPostId|postId|post_id)"\s*:\s*"([^"]+)"/);
          if (m2) postId = m2[1];
        }
      } catch {}
    }
  }
  await reader.cancel().catch(() => {});

  // Fallback: extract post_id từ video URL pattern /generated/UUID/
  if (!postId && videoUrl) {
    const m = videoUrl.match(/\/generated\/([0-9a-f-]{32,36})\//i);
    if (m) postId = m[1];
  }

  if (!videoUrl) {
    console.error('[directConversationNew] No videoUrl found. Raw stream sample:', rawDebug.substring(0, 2000));
    throw new Error('Extend video không trả về video URL');
  }
  console.log(`[directConversationNew] videoUrl=OK postId=${postId || 'MISSING'}`);
  return { videoUrl, postId };
}

// ── Direct: extend video ──
async function directExtendVideo(cookies, prompt, referenceId, startTime, opts = {}) {
  const { aspect_ratio = '16:9', video_length = 6, resolution = '480p' } = opts;
  // Theo curl thực tế từ Grok.com: extend chỉ là video gen thường với parentPostId
  // Dùng endpoint /rest/app-chat/conversations/new với responseMetadata wrapper
  const message = `${prompt} --mode=custom`.trim();
  const body = {
    temporary: true,
    modelName: 'grok-3',
    message,
    toolOverrides: { videoGen: true },
    enableSideBySide: false,
    responseMetadata: {
      experiments: [],
      modelConfigOverride: {
        modelMap: {
          videoGenModelConfig: {
            parentPostId: referenceId,
            aspectRatio: aspect_ratio,
            videoLength: parseInt(video_length) || 6,
            isVideoEdit: false,
            resolutionName: resolution,
          }
        }
      }
    }
  };
  const { videoUrl, postId: resultPostId } = await directConversationNew(cookies, body);
  return { url: videoUrl, reference_id: resultPostId || referenceId };
}

// ── Direct: tạo ảnh (WebSocket-based, dùng REST endpoint) ──
async function directGenerateImage(cookies, prompt, opts = {}) {
  const { size = '1024x1024', n = 1 } = opts;
  const [w, h] = size.split('x').map(Number);
  const body = {
    message: prompt,
    modelName: 'grok-3',
    toolOverrides: { imageGen: true },
    modelConfigOverride: {
      modelMap: {
        imageGenModelConfig: {
          imageCount: n || 1,
          imageWidth: w || 1024,
          imageHeight: h || 1024,
        }
      }
    },
    isReasoning: false,
    returnImageBytes: false,
    temporary: false,
  };

  const resp = await fetch(`${GROK_BASE}/api/rpc/chat/create-response`, {
    method: 'POST',
    headers: grokHeaders(cookies),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    if (isGrokRateLimit(resp.status, txt)) throw new Error('RATE_LIMITED: Token bị giới hạn tạm thời');
    if (resp.status === 403) throw new Error('CF_BLOCKED: Cần cập nhật cookie cf_clearance');
    throw new Error(`Tạo ảnh thất bại (${resp.status}): ${txt.substring(0, 200)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let imageUrl = '', buf = '';
  const deadline = Date.now() + 120000;

  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;
      try {
        const payload = JSON.parse(trimmed);
        const resp2 = payload?.result?.response;
        if (!resp2) continue;
        // Image URL from fileAttachments or imageGenerationResponse
        const fa = resp2?.modelResponse?.fileAttachments;
        if (Array.isArray(fa) && fa[0] && typeof fa[0] === 'string' && fa[0].startsWith('http')) {
          imageUrl = fa[0];
        }
        const igr = resp2?.imageGenerationResponse;
        if (igr?.imageUrl) imageUrl = igr.imageUrl;
        if (igr?.images?.[0]?.url) imageUrl = igr.images[0].url;
      } catch {}
    }
    if (imageUrl) break;
  }
  await reader.cancel().catch(() => {});

  if (!imageUrl) throw new Error('Direct stream không trả về image URL');
  return imageUrl;
}

// ── Direct: edit ảnh ──
async function directEditImage(cookies, prompt, imageUrl, opts = {}) {
  const { size = '1024x1024', n = 1 } = opts;
  const [w, h] = size.split('x').map(Number);
  // Upload image as media post first
  const postId = await directCreateMediaPost(cookies, 'MEDIA_POST_TYPE_IMAGE', '', imageUrl);
  const body = {
    message: prompt,
    modelName: 'grok-3',
    toolOverrides: { imageGen: true },
    modelConfigOverride: {
      modelMap: {
        imageGenModelConfig: {
          imageCount: n || 1,
          imageWidth: w || 1024,
          imageHeight: h || 1024,
          referenceImagePostId: postId,
        }
      }
    },
    isReasoning: false,
    returnImageBytes: false,
    temporary: false,
  };

  const resp = await fetch(`${GROK_BASE}/api/rpc/chat/create-response`, {
    method: 'POST',
    headers: grokHeaders(cookies),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    if (isGrokRateLimit(resp.status, txt)) throw new Error('RATE_LIMITED: Token bị giới hạn tạm thời');
    if (resp.status === 403) throw new Error('CF_BLOCKED: Cần cập nhật cookie cf_clearance');
    throw new Error(`Chỉnh sửa ảnh thất bại (${resp.status}): ${txt.substring(0, 200)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let resultUrl = '', buf = '';
  const deadline = Date.now() + 120000;

  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;
      try {
        const payload = JSON.parse(trimmed);
        const resp2 = payload?.result?.response;
        if (!resp2) continue;
        const fa = resp2?.modelResponse?.fileAttachments;
        if (Array.isArray(fa) && fa[0] && typeof fa[0] === 'string' && fa[0].startsWith('http')) resultUrl = fa[0];
        const igr = resp2?.imageGenerationResponse;
        if (igr?.imageUrl) resultUrl = igr.imageUrl;
        if (igr?.images?.[0]?.url) resultUrl = igr.images[0].url;
      } catch {}
    }
    if (resultUrl) break;
  }
  await reader.cancel().catch(() => {});

  if (!resultUrl) throw new Error('Chỉnh sửa ảnh không trả về kết quả');
  return resultUrl;
}

// ════════════════════════════════════════════════════════════════
// MODE 2: REVERSE FALLBACK — qua Grok2API VPS
// ════════════════════════════════════════════════════════════════

async function injectIntoGrok2API(apiBase, cookies) {
  const ssoToken = cookies.sso;
  if (!ssoToken) throw new Error('Không tìm thấy SSO token để inject');
  try {
    try {
      await fetch(`${apiBase}/v1/admin/tokens`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${GROK2API_KEY}` },
      });
    } catch {}
    const r = await fetch(`${apiBase}/v1/admin/tokens`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROK2API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssoBasic: [{ token: ssoToken }], ssoSuper: [{ token: ssoToken }] }),
    });
    if (!r.ok && r.status >= 500) console.error('Grok2API inject SSO returned:', r.status);
  } catch (e) {
    throw new Error(`Không kết nối được Grok2API (tunnel đứt?): ${e.message}`);
  }
  // Chỉ inject cf_clearance nếu user có — nếu không có thì để VPS tự dùng cf_clearance của mình
  // (CF Refresh service trên VPS tự lấy cf_clearance hợp lệ)
  try {
    if (cookies.cfClearance) {
      const cfConfig = {
        cf_clearance: cookies.cfClearance,
        user_agent: CF_USER_AGENT,
      };
      if (cookies.cookieStr) {
        const cfParts = cookies.cookieStr.split('; ').filter(p => {
          const name = p.split('=')[0];
          return name !== 'sso' && name !== 'sso-rw';
        });
        if (cfParts.length > 0) cfConfig.cf_cookies = cfParts.join('; ');
      }
      await fetch(`${apiBase}/v1/admin/config`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROK2API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy: cfConfig, app: { video_format: 'url', app_url: apiBase } }),
      });
    } else {
      // Chỉ update app config, giữ nguyên cf_clearance của VPS
      await fetch(`${apiBase}/v1/admin/config`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROK2API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: { video_format: 'url', app_url: apiBase } }),
      });
    }
  } catch (e) {
    console.error('Failed to inject CF config:', e.message);
  }
}

async function reverseGenerateVideo(apiBase, cookies, prompt, opts = {}) {
  await injectIntoGrok2API(apiBase, cookies);
  const { aspect_ratio = '16:9', video_length = 6, resolution = '480p' } = opts;
  const sizeMap = { '16:9': '1280x720', '9:16': '720x1280', '1:1': '1024x1024', '3:2': '1792x1024', '2:3': '1024x1792' };
  const resp = await fetch(`${apiBase}/v1/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROK2API_KEY}` },
    body: JSON.stringify({ prompt, size: sizeMap[aspect_ratio] || '1280x720', seconds: video_length || 6, quality: resolution === '720p' ? 'high' : 'standard' }),
  });
  let result;
  try { result = await resp.json(); } catch { result = {}; }
  const respText = JSON.stringify(result).substring(0, 500);
  if (!resp.ok || result?.error) {
    const msg = result?.error?.message || result?._rawText || `Tạo video thất bại (HTTP ${resp.status})`;
    const fullText = msg + ' ' + respText;
    if (isGrokRateLimit(resp.status, fullText)) throw new Error(`RATE_LIMITED: Token bị giới hạn tạm thời`);
    if (resp.status === 403 || fullText.includes('Cloudflare')) throw new Error(`CF_BLOCKED: Cần cập nhật cookie cf_clearance`);
    throw new Error(msg);
  }
  let url = result?.url || result?.data?.[0]?.url || '';
  if (url && url.startsWith('/')) url = apiBase + url;
  if (!url) {
    const content = result?.choices?.[0]?.message?.content || '';
    const m = content.match(/https?:\/\/[^\s"'<>]+\.(mp4|webm)/i);
    if (m) url = m[0];
  }
  if (!url) throw new Error('Reverse: Tạo video không trả về URL');
  const refId = result?.post_id || result?.reference_id || result?.id || '';
  return { url, reference_id: refId };
}

async function reverseGenerateImageVideo(apiBase, cookies, prompt, imageUrl, opts = {}) {
  await injectIntoGrok2API(apiBase, cookies);
  const { aspect_ratio = '16:9', video_length = 6, resolution = '480p' } = opts;
  const sizeMap = { '16:9': '1280x720', '9:16': '720x1280', '1:1': '1024x1024', '3:2': '1792x1024', '2:3': '1024x1792' };
  const resp = await fetch(`${apiBase}/v1/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROK2API_KEY}` },
    body: JSON.stringify({ prompt, image_reference: { image_url: imageUrl }, size: sizeMap[aspect_ratio] || '1280x720', seconds: video_length || 6, quality: resolution === '720p' ? 'high' : 'standard' }),
  });
  let result;
  try { result = await resp.json(); } catch { result = {}; }
  if (!resp.ok || result?.error) {
    const msg = result?.error?.message || `Ảnh→Video thất bại (HTTP ${resp.status})`;
    const fullText = msg + ' ' + JSON.stringify(result).substring(0, 300);
    if (isGrokRateLimit(resp.status, fullText)) throw new Error(`RATE_LIMITED: Token bị giới hạn tạm thời`);
    if (resp.status === 403) throw new Error(`CF_BLOCKED: Cần cập nhật cookie cf_clearance`);
    throw new Error(msg);
  }
  let url = result?.url || result?.data?.[0]?.url || '';
  if (url && url.startsWith('/')) url = apiBase + url;
  if (!url) throw new Error('Reverse: Ảnh→Video không trả về URL');
  const refId = result?.post_id || result?.reference_id || result?.id || '';
  return { url, reference_id: refId };
}

async function reverseExtendVideo(apiBase, cookies, prompt, referenceId, startTime, opts = {}) {
  await injectIntoGrok2API(apiBase, cookies);
  const { aspect_ratio = '16:9', video_length = 6, resolution = '480p' } = opts;
  const resp = await fetch(`${apiBase}/v1/video/extend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROK2API_KEY}` },
    body: JSON.stringify({ prompt, reference_id: referenceId, start_time: parseFloat(startTime) || 0, ratio: aspect_ratio, length: video_length || 6, resolution: resolution || '480p' }),
  });
  let result;
  try { result = await resp.json(); } catch { result = {}; }
  if (!resp.ok || result?.error) {
    const msg = result?.error?.message || `Kéo dài video thất bại (HTTP ${resp.status})`;
    const fullText = msg + ' ' + JSON.stringify(result).substring(0, 300);
    if (isGrokRateLimit(resp.status, fullText)) throw new Error(`RATE_LIMITED: Token bị giới hạn tạm thời`);
    if (resp.status === 403) throw new Error(`CF_BLOCKED: Cần cập nhật cookie cf_clearance`);
    throw new Error(msg);
  }
  let url = result?.url || result?.data?.[0]?.url || '';
  if (url && url.startsWith('/')) url = apiBase + url;
  if (!url) throw new Error('Reverse: Kéo dài video không trả về URL');
  const refId = result?.post_id || result?.reference_id || result?.id || '';
  return { url, reference_id: refId };
}

async function reverseGenerateImage(apiBase, cookies, prompt, opts = {}) {
  await injectIntoGrok2API(apiBase, cookies);
  const { size = '1024x1024', n = 1 } = opts;
  const resp = await fetch(`${apiBase}/v1/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROK2API_KEY}` },
    body: JSON.stringify({ prompt, n, size, model: 'grok-imagine-1.0' }),
  });
  let result;
  try { result = await resp.json(); } catch { result = {}; }
  if (!resp.ok || result?.error) {
    const msg = result?.error?.message || `Tạo ảnh thất bại (HTTP ${resp.status})`;
    const fullText = msg + ' ' + JSON.stringify(result).substring(0, 300);
    if (isGrokRateLimit(resp.status, fullText)) throw new Error(`RATE_LIMITED: Token bị giới hạn tạm thời`);
    if (resp.status === 403) throw new Error(`CF_BLOCKED: Cần cập nhật cookie cf_clearance`);
    throw new Error(msg);
  }
  const url = result?.data?.[0]?.url;
  if (url) return url.startsWith('/') ? apiBase + url : url;
  if (result?.data?.[0]?.b64_json) return `data:image/png;base64,${result.data[0].b64_json}`;
  throw new Error('Reverse: Tạo ảnh không trả về kết quả');
}

async function reverseEditImage(apiBase, cookies, prompt, imageUrl, opts = {}) {
  await injectIntoGrok2API(apiBase, cookies);
  const { size = '1024x1024', n = 1 } = opts;
  const resp = await fetch(`${apiBase}/v1/images/edits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROK2API_KEY}` },
    body: JSON.stringify({ prompt, image: imageUrl, n, size, model: 'grok-imagine-1.0-edit' }),
  });
  let result;
  try { result = await resp.json(); } catch { result = {}; }
  if (!resp.ok || result?.error) {
    const msg = result?.error?.message || `Chỉnh sửa ảnh thất bại (HTTP ${resp.status})`;
    const fullText = msg + ' ' + JSON.stringify(result).substring(0, 300);
    if (isGrokRateLimit(resp.status, fullText)) throw new Error(`RATE_LIMITED: Token bị giới hạn tạm thời`);
    if (resp.status === 403) throw new Error(`CF_BLOCKED: Cần cập nhật cookie cf_clearance`);
    throw new Error(msg);
  }
  const url = result?.data?.[0]?.url;
  if (url) return url.startsWith('/') ? apiBase + url : url;
  if (result?.data?.[0]?.b64_json) return `data:image/png;base64,${result.data[0].b64_json}`;
  throw new Error('Reverse: Chỉnh sửa ảnh không trả về kết quả');
}

// ════════════════════════════════════════════════════════════════
// UNIFIED: Direct → Fallback Reverse
// ════════════════════════════════════════════════════════════════

// Wrapper: thử direct trước, nếu lỗi (không phải rate limit / CF block) thì fallback reverse
async function withFallback(directFn, reverseFn, label) {
  try {
    const result = await directFn();
    console.log(`[${label}] direct OK`);
    return result;
  } catch (e) {
    const msg = e.message || '';
    // CF_BLOCKED (thiếu cf_clearance) → fallback sang reverse vì VPS có CF Refresh
    if (msg.startsWith('CF_BLOCKED')) {
      console.warn(`[${label}] direct CF_BLOCKED (no cf_clearance), fallback to reverse...`);
      return await reverseFn();
    }
    // RATE_LIMITED → thử fallback reverse trước khi throw
    if (msg.startsWith('RATE_LIMITED')) {
      console.warn(`[${label}] direct RATE_LIMITED, trying reverse fallback...`);
      try {
        return await reverseFn();
      } catch (e2) {
        console.warn(`[${label}] reverse also failed: ${e2.message?.substring(0, 100)}`);
        throw e;
      }
    }
    console.warn(`[${label}] direct failed (${msg.substring(0, 100)}), fallback to reverse...`);
    return await reverseFn();
  }
}

async function generateVideo(apiBase, cookies, prompt, opts = {}) {
  return withFallback(
    () => directGenerateVideo(cookies, prompt, opts),
    () => reverseGenerateVideo(apiBase, cookies, prompt, opts),
    'text2video'
  );
}

async function generateImageVideo(apiBase, cookies, prompt, imageUrl, opts = {}) {
  // imageUrl here is always an R2 URL (base64 was already converted upstream)
  // Try direct first, fallback to reverse with same R2 URL (Grok can fetch public grok.liveyt.pro URLs)
  try {
    const result = await directGenerateImageVideo(cookies, prompt, imageUrl, opts);
    console.log('[image2video] direct OK');
    return result;
  } catch (e) {
    const msg = e.message || '';
    console.warn(`[image2video] direct failed: ${msg.substring(0, 200)}`);
    if (msg.startsWith('RATE_LIMITED')) {
      throw new Error('Token bị giới hạn tạm thời. Vui lòng thử lại sau hoặc thêm token mới.');
    }
    // CF_BLOCKED or other errors: fallback to reverse with R2 URL
    console.warn('[image2video] fallback to reverse...');
    return await reverseGenerateImageVideo(apiBase, cookies, prompt, imageUrl, opts);
  }
}

async function extendVideo(apiBase, cookies, prompt, referenceId, startTime, opts = {}) {
  return withFallback(
    () => directExtendVideo(cookies, prompt, referenceId, startTime, opts),
    () => reverseExtendVideo(apiBase, cookies, prompt, referenceId, startTime, opts),
    'extend_video'
  );
}

async function generateImage(apiBase, cookies, prompt, opts = {}) {
  return withFallback(
    () => directGenerateImage(cookies, prompt, opts),
    () => reverseGenerateImage(apiBase, cookies, prompt, opts),
    'text2image'
  );
}

async function editImage(apiBase, cookies, prompt, imageUrl, opts = {}) {
  return withFallback(
    () => directEditImage(cookies, prompt, imageUrl, opts),
    () => reverseEditImage(apiBase, cookies, prompt, imageUrl, opts),
    'image2image'
  );
}

// ════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════

export async function handleGenerate(request, env, user) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Phương thức không hỗ trợ' }, 405);
  const userId = user.sub;
  const body = await request.json();
  const apiBase = env.GROK_API_BASE;
  if (!apiBase) return jsonResponse({ error: 'GROK_API_BASE chưa được cấu hình.' }, 500);

  // ── Diagnostic ──
  if (body.type === 'diagnose') {
    const account = await getRandomToken(env, userId);
    if (!account) return jsonResponse({ hasAccount: false, apiReachable: false, hint: 'Chưa có tài khoản Grok. Thêm token trong phần Cài Đặt Token.' });
    const cookies = parseCookies(account.sso_token);
    let apiOk = false, apiError = '';
    try {
      const t = await fetch(`${apiBase}/v1/admin/verify`, { headers: { 'Authorization': `Bearer ${GROK2API_KEY}` } });
      apiOk = t.status === 200;
      if (!apiOk) apiError = `HTTP ${t.status}`;
    } catch (e) { apiError = e.message; }
    // Also test direct grok.com reachability
    let directOk = false;
    try {
      const t = await fetch(`${GROK_BASE}/`, { method: 'HEAD', headers: { 'User-Agent': CF_USER_AGENT }, signal: AbortSignal.timeout(5000) });
      directOk = t.status < 500;
    } catch {}
    return jsonResponse({
      hasAccount: true, hasSso: !!cookies.sso, hasCfClearance: !!cookies.cfClearance,
      apiReachable: apiOk, directReachable: directOk, apiBase,
      hint: !cookies.sso ? 'Thiếu SSO token' : directOk ? 'Direct mode khả dụng' : 'Chỉ dùng được reverse mode',
    });
  }

  const { type, prompt, image_url, reference_id, start_time, aspect_ratio, video_length, resolution, size, n, account_id, session_id, session_name } = body;
  if (!type || !prompt) return jsonResponse({ error: 'Thiếu loại hoặc prompt' }, 400);

  const allowed = await checkFeature(env, userId, type);
  if (!allowed) return jsonResponse({ error: 'Tính năng này không khả dụng trên gói của bạn.' }, 403);
  if (!(await checkCredits(env, userId))) return jsonResponse({ error: 'Đã hết lượt sử dụng.' }, 403);
  const dailyCheck = await checkDailyLimit(env, userId, type);
  if (!dailyCheck.ok) return jsonResponse({ error: dailyCheck.msg, daily_limit: true }, 429);

  // Get account/token
  let account;
  if (account_id) {
    account = await env.DB.prepare("SELECT id, sso_token FROM grok_accounts WHERE id = ? AND user_id = ? AND status = 'active'").bind(account_id, userId).first() || null;
    if (!account) {
      const cooled = await env.DB.prepare("SELECT id, sso_token FROM grok_accounts WHERE id = ? AND user_id = ? AND status = 'limited' AND limited_at <= datetime('now', '-2 hours')").bind(account_id, userId).first();
      if (cooled) {
        await env.DB.prepare("UPDATE grok_accounts SET status = 'active', limited_at = NULL WHERE id = ?").bind(cooled.id).run();
        account = cooled;
      } else {
        account = await getRandomToken(env, userId);
      }
    }
  } else {
    account = await getRandomToken(env, userId);
  }

  if (!account) {
    const limitedCount = await env.DB.prepare("SELECT COUNT(*) as cnt FROM grok_accounts WHERE user_id = ? AND status = 'limited'").bind(userId).first();
    if (limitedCount?.cnt > 0) {
      return jsonResponse({ error: `⛔ Tất cả ${limitedCount.cnt} token Grok đều đang bị khóa (rate limit). Token sẽ tự mở khóa sau 1h30-2h. Thêm tài khoản Grok mới hoặc đợi.`, all_limited: true, token_cooling: true }, 429);
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
    await randomDelay(2000, 3000);

    // Convert base64 data URL to R2 URL if needed (VPS cannot handle base64)
    let resolvedImageUrl = image_url;
    if (image_url && image_url.startsWith('data:') && env.MEDIA) {
      resolvedImageUrl = await uploadBase64ToR2(env, image_url, `https://grok.liveyt.pro`);
      console.log('[image2video] base64 uploaded to R2:', resolvedImageUrl);
    }

    let result = { url: '', reference_id: '' };

    switch (type) {
      case 'text2video':
        result = await generateVideo(apiBase, cookies, prompt, { aspect_ratio, video_length: video_length || 6, resolution: resolution || '480p' });
        break;
      case 'image2video':
        if (!resolvedImageUrl) throw new Error('Vui lòng tải ảnh lên trước');
        result = await generateImageVideo(apiBase, cookies, prompt, resolvedImageUrl, { aspect_ratio, video_length: video_length || 6, resolution: resolution || '480p' });
        break;
      case 'text2image': {
        const imgUrl = await generateImage(apiBase, cookies, prompt, { size, n });
        result = { url: imgUrl, reference_id: '' };
        break;
      }
      case 'image2image': {
        if (!resolvedImageUrl) throw new Error('Vui lòng tải ảnh lên trước');
        const imgUrl = await editImage(apiBase, cookies, prompt, resolvedImageUrl, { size, n });
        result = { url: imgUrl, reference_id: '' };
        break;
      }
      case 'extend_video':
        if (!reference_id) throw new Error('Thiếu Reference ID');
        result = await extendVideo(apiBase, cookies, prompt, reference_id, start_time || 0, { aspect_ratio, video_length: video_length || 6, resolution: resolution || '480p' });
        break;
      default:
        return jsonResponse({ error: 'Loại không hợp lệ' }, 400);
    }

    const outputUrl = result.url || result;
    if (!outputUrl) {
      await env.DB.prepare("UPDATE history SET status = 'failed', metadata = '{}' WHERE id = ?").bind(historyId).run();
      return jsonResponse({ error: 'Tạo không trả về kết quả.' }, 502);
    }

    let permanentUrl = outputUrl;
    if (env.MEDIA) {
      const r2Url = await saveToR2(env, outputUrl, type, historyId);
      if (r2Url) permanentUrl = r2Url;
    }

    await env.DB.prepare("UPDATE history SET status = 'completed', output_url = ?, completed_at = datetime('now') WHERE id = ?").bind(permanentUrl, historyId).run();
    await deductCredit(env, userId);
    await env.DB.prepare("UPDATE grok_accounts SET last_used = datetime('now') WHERE id = ? AND user_id = ?").bind(account.id, userId).run();

    return jsonResponse({ success: true, historyId, outputUrl: permanentUrl, accountId: account.id, reference_id: result.reference_id || '' });

  } catch (err) {
    const msg = err.message || 'Unknown error';
    try {
      if (historyId) await env.DB.prepare("UPDATE history SET status = 'failed', metadata = ? WHERE id = ?").bind(JSON.stringify({ error: msg }), historyId).run();
    } catch {}

    if (msg.startsWith('CF_BLOCKED')) {
      return jsonResponse({ error: 'Bị chặn bởi Cloudflare (403). Cookie cần có cf_clearance.\n1. Mở grok.com trên Chrome\n2. Giải CF challenge\n3. Export tất cả cookie (bao gồm cf_clearance)\n4. Cập nhật lại cookie mới', cf_blocked: true }, 502);
    }

    const isRateLimit = msg.startsWith('RATE_LIMITED') || msg.includes('429') ||
      msg.includes('Too many requests') || msg.includes('cooling down') ||
      (msg.includes('rate limit') && !msg.includes('rate_limit_exceeded')) ||
      (msg.includes('quota') && !msg.includes('rate_limit_exceeded'));

    if (isRateLimit) {
      if (account?.id) {
        try { await env.DB.prepare("UPDATE grok_accounts SET status = 'limited', limited_at = datetime('now') WHERE id = ? AND user_id = ?").bind(account.id, userId).run(); } catch {}
      }
      const remaining = await env.DB.prepare("SELECT COUNT(*) as cnt FROM grok_accounts WHERE user_id = ? AND status = 'active'").bind(userId).first();
      const allLimited = (remaining?.cnt || 0) === 0;
      return jsonResponse({
        error: allLimited
          ? '⛔ Tất cả token Grok đều đã bị giới hạn (rate limit từ Grok.com). Token sẽ tự mở khóa sau 1h30-2h. Thêm tài khoản Grok mới để tiếp tục.'
          : `⚠️ Token Grok #${account?.id} đã bị giới hạn. Còn ${remaining.cnt} token khác đang hoạt động.`,
        token_rate_limited: true, account_id: account?.id || null,
        all_limited: allLimited, remaining_active: remaining?.cnt || 0,
      }, 429);
    }

    if (msg.includes('No available token')) {
      return jsonResponse({ error: '⛔ Tất cả token Grok đang bị giới hạn (cooling). Token sẽ tự mở khóa sau 1h30-2h.', token_cooling: true, all_limited: true }, 429);
    }

    const isNetworkError = msg.includes('fetch failed') || msg.includes('ECONNREFUSED') ||
      msg.includes('socket') || msg.includes('timeout') || msg.includes('abort') ||
      msg.includes('DNS') || msg.includes('ENOTFOUND') || msg.includes('unreachable');
    if (isNetworkError) {
      return jsonResponse({ error: '⛔ Token Grok đang bị giới hạn tạm thời. Vui lòng đợi 1-2h hoặc thử token khác.', token_rate_limited: true }, 429);
    }

    return jsonResponse({ error: msg || 'Lỗi không xác định. Vui lòng thử lại.' }, 500);
  }
}

// ── Video Project: chain gen + extend ──
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

    const len = parseInt(video_length) || 6;
    const maxClips = Math.floor(30 / len);
    const clips = prompts.slice(0, maxClips);

    if (!(await checkCredits(env, userId))) return jsonResponse({ error: 'Đã hết lượt sử dụng.' }, 403);
    if (!(await checkFeature(env, userId, 'text2video'))) return jsonResponse({ error: 'Tính năng này không khả dụng trên gói của bạn.' }, 403);

    let tokens = (await env.DB.prepare("SELECT id, sso_token FROM grok_accounts WHERE user_id = ? AND status = 'active' ORDER BY RANDOM()").bind(userId).all())?.results || [];
    if (tokens.length === 0) {
      const cooled = (await env.DB.prepare("SELECT id, sso_token FROM grok_accounts WHERE user_id = ? AND status = 'limited' AND limited_at <= datetime('now', '-2 hours') ORDER BY RANDOM()").bind(userId).all())?.results || [];
      for (const t of cooled) await env.DB.prepare("UPDATE grok_accounts SET status = 'active', limited_at = NULL WHERE id = ?").bind(t.id).run();
      tokens = cooled;
    }
    if (tokens.length === 0) return jsonResponse({ error: 'Chưa có token Grok hoạt động.' }, 400);

    const histResult = await env.DB.prepare(
      "INSERT INTO history (user_id, type, prompt, status, session_id, session_name) VALUES (?, 'text2video', ?, 'processing', ?, ?)"
    ).bind(userId, clips.join('\n---\n'), session_id || null, session_name || null).run();
    const historyId = histResult.meta.last_row_id;

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    let writerClosed = false;
    const safeSend = async (data) => {
      if (writerClosed) return;
      try { await writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
    };
    const safeClose = async () => {
      if (writerClosed) return;
      writerClosed = true;
      try { await writer.close(); } catch {}
    };

    const processChain = async () => {
      let tokenIdx = 0;
      const getNextToken = () => { const t = tokens[tokenIdx % tokens.length]; tokenIdx++; return t; };
      let lastRefId = reference_id || '';
      let lastUrl = '';
      let totalTime = (reference_id && start_time) ? (parseFloat(start_time) || 0) : 0;
      const results = [];

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
          await randomDelay(2000, 3000);

          try {
            let res;
            if (i === 0 && !reference_id) {
              res = await generateVideo(apiBase, cookies, clipPrompt, { aspect_ratio, video_length: len, resolution });
            } else {
              const refId = (i === 0 && reference_id) ? reference_id : lastRefId;
              const st = (i === 0 && reference_id) ? (parseFloat(start_time) || 0) : totalTime;
              if (!refId) {
                await safeSend({ step: i + 1, total: clips.length, status: 'error', error: 'Không có reference_id từ clip trước. Dừng project.' });
                break;
              }
              console.log(`[VP] clip ${i+1} extend: refId=${refId} startTime=${st}`);
              res = await extendVideo(apiBase, cookies, clipPrompt, refId, st, { aspect_ratio, video_length: len, resolution });
            }
            lastUrl = res.url;
            lastRefId = res.reference_id || lastRefId;
            totalTime += len;
            results.push({ step: i + 1, url: res.url, reference_id: res.reference_id });
            console.log(`[VP] clip ${i+1} done: url=${res.url ? 'OK' : 'MISSING'} ref=${res.reference_id || 'MISSING'} nextRef=${lastRefId || 'MISSING'}`);
            await safeSend({ step: i + 1, total: clips.length, status: 'done', url: res.url, reference_id: res.reference_id, duration: totalTime });
          } catch (err) {
            const msg = err.message || '';
            if (msg.startsWith('RATE_LIMITED') || msg.includes('429')) {
              try { await env.DB.prepare("UPDATE grok_accounts SET status = 'limited', limited_at = datetime('now') WHERE id = ? AND user_id = ?").bind(token.id, userId).run(); } catch {}
              tokens = tokens.filter(t => t.id !== token.id);
              if (tokens.length === 0) {
                await safeSend({ step: i + 1, total: clips.length, status: 'error', error: 'Tất cả token đã bị giới hạn. Dừng project.' });
                break;
              }
              i--;
              await safeSend({ step: i + 2, total: clips.length, status: 'retry', error: `Token #${token.id} bị limit, thử token khác...` });
              continue;
            }
            await safeSend({ step: i + 1, total: clips.length, status: 'error', error: '⛔ Token bị giới hạn tạm thời' });
            break;
          }
        }

        if (lastUrl) {
          let permanentUrl = lastUrl;
          if (env.MEDIA) {
            const r2Url = await saveToR2(env, lastUrl, 'video_project', historyId);
            if (r2Url) permanentUrl = r2Url;
          }
          await env.DB.prepare("UPDATE history SET status = 'completed', output_url = ?, completed_at = datetime('now'), metadata = ? WHERE id = ?")
            .bind(permanentUrl, JSON.stringify({ clips: results.length, duration: totalTime, steps: results }), historyId).run();
          await deductCredit(env, userId);
          await safeSend({ status: 'completed', url: permanentUrl, historyId, clips: results.length, duration: totalTime });
        } else {
          await env.DB.prepare("UPDATE history SET status = 'failed', metadata = ? WHERE id = ?").bind(JSON.stringify({ error: 'Không tạo được clip nào' }), historyId).run();
          await safeSend({ status: 'failed', error: 'Không tạo được clip nào' });
        }
      } catch (e) {
        try { await env.DB.prepare("UPDATE history SET status = 'failed', metadata = ? WHERE id = ?").bind(JSON.stringify({ error: e.message }), historyId).run(); } catch {}
        await safeSend({ status: 'failed', error: e.message });
      } finally {
        await safeSend({ status: 'done_stream' });
        await safeClose();
      }
    };

    const chainPromise = processChain().catch(e => console.error('processChain unhandled:', e.message));
    if (ctx && ctx.waitUntil) ctx.waitUntil(chainPromise);

    return new Response(readable, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e) {
    console.error('handleVideoProject crash:', e.message);
    return jsonResponse({ error: 'Video Project lỗi: ' + e.message }, 500);
  }
}
