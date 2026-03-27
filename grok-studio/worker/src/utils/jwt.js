export async function createJWT(payload, secret) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = btoa(JSON.stringify({ ...payload, iat: now, exp: now + 86400 }));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigB64}`;
}

export async function verifyJWT(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    const [header, body, sig] = token.split('.');
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(env.JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const valid = await crypto.subtle.verify(
      'HMAC', key, Uint8Array.from(atob(sig), c => c.charCodeAt(0)),
      new TextEncoder().encode(`${header}.${body}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(atob(body));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    // Fetch current role from DB (so role changes take effect immediately)
    // Also check single-device session
    if (payload.sub && env.DB) {
      const u = await env.DB.prepare('SELECT role, active_session, tool_session FROM users WHERE id = ?').bind(payload.sub).first();
      if (u) {
        payload.role = u.role;
        // Session check: only kick if sid present AND DB session set AND mismatch
        // Tool sessions are strictly enforced; web sessions are lenient (allow multi-tab/device)
        if (payload.sid && payload.src === 'tool') {
          const dbSession = u.tool_session;
          if (dbSession && payload.sid !== dbSession) {
            return { _kicked: true };
          }
        }
        // Web: only kick if explicitly flagged (active_session mismatch)
        // Disabled for web to allow multi-tab and avoid false kicks after deploy
      }
    }
    return payload;
  } catch { return null; }
}
