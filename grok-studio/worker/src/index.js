import { handleAuth } from './routes/auth.js';
import { handleAccounts } from './routes/accounts.js';
import { handleGenerate } from './routes/generate.js';
import { handleHistory } from './routes/history.js';
import { handlePlans } from './routes/plans.js';
import { handleAdmin } from './routes/admin.js';
import { handlePayment, handleWebhook } from './routes/payment.js';
import { handleAffiliate } from './routes/affiliate.js';
import { verifyJWT } from './utils/jwt.js';
import { corsHeaders, jsonResponse } from './utils/response.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Serve static frontend via ASSETS binding
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    try {
      const path = url.pathname;

      // Public routes
      if (path.startsWith('/api/auth/')) {
        return handleAuth(request, env, path);
      }
      if (path === '/api/plans' && request.method === 'GET') {
        return handlePlans(request, env);
      }

      // Public: Web2M webhook (no JWT needed)
      if (path === '/api/webhook/web2m' && request.method === 'POST') {
        return handleWebhook(request, env);
      }

      // Public: Serve media from R2
      if (path.startsWith('/api/media/') && request.method === 'GET') {
        const key = path.replace('/api/media/', '');
        if (!key || !env.MEDIA) return jsonResponse({ error: 'Not found' }, 404);
        const obj = await env.MEDIA.get(key);
        if (!obj) return jsonResponse({ error: 'File not found' }, 404);
        return new Response(obj.body, {
          headers: {
            ...corsHeaders(),
            'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
          }
        });
      }

      // Internal API for cf_service — auth by INTERNAL_KEY header
      if (path === '/api/internal/sso-tokens' && request.method === 'GET') {
        const key = request.headers.get('X-Internal-Key');
        if (!key || key !== env.INTERNAL_KEY) {
          return jsonResponse({ error: 'Forbidden' }, 403);
        }
        const rows = await env.DB.prepare(
          "SELECT sso_token FROM grok_accounts WHERE status = 'active' LIMIT 50"
        ).all();
        const tokens = rows.results.map(r => {
          try {
            const arr = JSON.parse(r.sso_token);
            if (Array.isArray(arr)) {
              const sso = arr.find(c => c.name === 'sso');
              return sso?.value || null;
            }
          } catch {}
          const s = r.sso_token.trim();
          return s.startsWith('sso=') ? s.slice(4) : s;
        }).filter(Boolean);
        return jsonResponse({ tokens });
      }

      // Protected routes - verify JWT
      const user = await verifyJWT(request, env);
      if (!user) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      // Single-device enforcement: session was invalidated by another login
      if (user._kicked) {
        return jsonResponse({ error: 'Tài khoản đã đăng nhập ở thiết bị khác. Vui lòng đăng nhập lại.', session_kicked: true }, 401);
      }

      if (path.startsWith('/api/accounts')) {
        return handleAccounts(request, env, user, path);
      }
      if (path.startsWith('/api/generate')) {
        return handleGenerate(request, env, user, path);
      }
      if (path.startsWith('/api/history')) {
        return handleHistory(request, env, user, path);
      }
      if (path.startsWith('/api/admin/')) {
        return handleAdmin(request, env, user, path);
      }
      if (path.startsWith('/api/payment/')) {
        return handlePayment(request, env, user, path);
      }
      if (path.startsWith('/api/affiliate/')) {
        return handleAffiliate(request, env, user, path);
      }

      // Proxy download — fetch remote media to avoid CORS issues
      if (path === '/api/proxy-dl' && request.method === 'POST') {
        const body = await request.json();
        const targetUrl = body.url;
        if (!targetUrl || !targetUrl.startsWith('http')) {
          return jsonResponse({ error: 'Invalid URL' }, 400);
        }
        try {
          const resp = await fetch(targetUrl);
          if (!resp.ok) return new Response('Fetch failed: ' + resp.status, { status: 502 });
          const blob = await resp.blob();
          return new Response(blob, {
            headers: {
              ...corsHeaders(),
              'Content-Type': resp.headers.get('Content-Type') || 'application/octet-stream',
              'Content-Disposition': `attachment; filename="${body.filename || 'file'}"`,
            }
          });
        } catch (e) {
          return jsonResponse({ error: 'Proxy fetch failed: ' + e.message }, 502);
        }
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: err.message || 'Internal error' }, 500);
    }
  }
};
