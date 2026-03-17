import { jsonResponse } from '../utils/response.js';

export async function handleHistory(request, env, user, path) {
  const userId = user.sub;

  // GET /api/history
  if (request.method === 'GET' && path === '/api/history') {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');
    const fav = url.searchParams.get('favorite');
    const dateFrom = url.searchParams.get('from'); // YYYY-MM-DD
    const dateTo = url.searchParams.get('to');     // YYYY-MM-DD
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let query = 'SELECT * FROM history WHERE user_id = ?';
    const params = [userId];
    if (type) { query += ' AND type = ?'; params.push(type); }
    if (status) { query += ' AND status = ?'; params.push(status); }
    if (fav === '1') { query += ' AND favorite = 1'; }
    if (dateFrom) { query += " AND created_at >= ?"; params.push(dateFrom + ' 00:00:00'); }
    if (dateTo) { query += " AND created_at <= ?"; params.push(dateTo + ' 23:59:59'); }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await env.DB.prepare(query).bind(...params).all();

    // Also get counts for stats bar
    const counts = await env.DB.prepare(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN favorite=1 THEN 1 ELSE 0 END) as favorites,
        SUM(CASE WHEN type LIKE '%video%' OR type='extend_video' THEN 1 ELSE 0 END) as videos,
        SUM(CASE WHEN type LIKE '%image%' THEN 1 ELSE 0 END) as images
      FROM history WHERE user_id = ?`
    ).bind(userId).first();

    return jsonResponse({ history: rows.results, stats: counts });
  }

  // PUT /api/history/:id/favorite — toggle favorite
  const favMatch = path.match(/^\/api\/history\/(\d+)\/favorite$/);
  if (request.method === 'PUT' && favMatch) {
    const id = parseInt(favMatch[1]);
    const row = await env.DB.prepare('SELECT favorite FROM history WHERE id = ? AND user_id = ?').bind(id, userId).first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    const newVal = row.favorite ? 0 : 1;
    await env.DB.prepare('UPDATE history SET favorite = ? WHERE id = ?').bind(newVal, id).run();
    return jsonResponse({ favorite: newVal });
  }

  // DELETE /api/history/:id
  const deleteMatch = path.match(/^\/api\/history\/(\d+)$/);
  if (request.method === 'DELETE' && deleteMatch) {
    const id = parseInt(deleteMatch[1]);
    await env.DB.prepare('DELETE FROM history WHERE id = ? AND user_id = ?').bind(id, userId).run();
    return jsonResponse({ message: 'Deleted' });
  }

  // POST /api/history/bulk — bulk operations (delete, favorite, unfavorite)
  if (request.method === 'POST' && path === '/api/history/bulk') {
    const { action, ids } = await request.json();
    if (!Array.isArray(ids) || !ids.length) return jsonResponse({ error: 'ids required' }, 400);

    // D1 has bind parameter limits — chunk into batches of 80
    const CHUNK = 80;
    const chunks = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

    if (action === 'delete') {
      const stmts = chunks.map(chunk => {
        const ph = chunk.map(() => '?').join(',');
        return env.DB.prepare(`DELETE FROM history WHERE id IN (${ph}) AND user_id = ?`).bind(...chunk, userId);
      });
      await env.DB.batch(stmts);
      return jsonResponse({ message: `Deleted ${ids.length} items` });
    }
    if (action === 'favorite') {
      const stmts = chunks.map(chunk => {
        const ph = chunk.map(() => '?').join(',');
        return env.DB.prepare(`UPDATE history SET favorite = 1 WHERE id IN (${ph}) AND user_id = ?`).bind(...chunk, userId);
      });
      await env.DB.batch(stmts);
      return jsonResponse({ message: 'Favorited' });
    }
    if (action === 'unfavorite') {
      const stmts = chunks.map(chunk => {
        const ph = chunk.map(() => '?').join(',');
        return env.DB.prepare(`UPDATE history SET favorite = 0 WHERE id IN (${ph}) AND user_id = ?`).bind(...chunk, userId);
      });
      await env.DB.batch(stmts);
      return jsonResponse({ message: 'Unfavorited' });
    }
    return jsonResponse({ error: 'Invalid action' }, 400);
  }

  // POST /api/history/bulk-status — delete all items by status
  if (request.method === 'POST' && path === '/api/history/bulk-status') {
    const { action, status } = await request.json();
    if (!status) return jsonResponse({ error: 'status required' }, 400);
    if (action === 'delete') {
      const r = await env.DB.prepare('DELETE FROM history WHERE user_id = ? AND status = ?')
        .bind(userId, status).run();
      return jsonResponse({ message: `Deleted all ${status} items`, count: r.meta?.changes || 0 });
    }
    if (action === 'select_ids') {
      const rows = await env.DB.prepare('SELECT id FROM history WHERE user_id = ? AND status = ?')
        .bind(userId, status).all();
      return jsonResponse({ ids: rows.results.map(r => r.id) });
    }
    return jsonResponse({ error: 'Invalid action' }, 400);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}
