import { jsonResponse } from '../utils/response.js';

export async function handleHistory(request, env, user, path) {
  const userId = user.sub;

  // GET /api/history/sessions — list sessions grouped
  if (request.method === 'GET' && path === '/api/history/sessions') {
    const rows = await env.DB.prepare(
      `SELECT session_id, session_name,
        COUNT(*) as total,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status='processing' THEN 1 ELSE 0 END) as processing,
        MIN(created_at) as started_at,
        MAX(completed_at) as last_completed,
        GROUP_CONCAT(DISTINCT type) as types
      FROM history WHERE user_id = ? AND session_id IS NOT NULL
      GROUP BY session_id
      ORDER BY started_at DESC`
    ).bind(userId).all();
    return jsonResponse({ sessions: rows.results });
  }

  // GET /api/history/sessions/:id — get items in a session
  const sessMatch = path.match(/^\/api\/history\/sessions\/([^/]+)$/);
  if (request.method === 'GET' && sessMatch) {
    const sid = decodeURIComponent(sessMatch[1]);
    const rows = await env.DB.prepare(
      'SELECT * FROM history WHERE user_id = ? AND session_id = ? ORDER BY id ASC'
    ).bind(userId, sid).all();
    return jsonResponse({ history: rows.results });
  }

  // DELETE /api/history/sessions/:id — delete all items in a session
  if (request.method === 'DELETE' && sessMatch) {
    const sid = decodeURIComponent(sessMatch[1]);
    const r = await env.DB.prepare(
      'DELETE FROM history WHERE user_id = ? AND session_id = ?'
    ).bind(userId, sid).run();
    return jsonResponse({ message: 'Đã xóa phiên', count: r.meta?.changes || 0 });
  }

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

    // Deduplicate: for each prompt, keep only the best record (completed > processing > failed), newest first
    // This prevents retry duplicates from inflating the count
    let query = `SELECT h.* FROM history h
      INNER JOIN (
        SELECT prompt, type, MAX(
          CASE WHEN status='completed' THEN 3 WHEN status='processing' THEN 2 ELSE 1 END * 1000000 + id
        ) as best_score
        FROM history WHERE user_id = ?
        GROUP BY prompt, type
      ) best ON h.user_id = ? AND h.prompt = best.prompt AND h.type = best.type
        AND (CASE WHEN h.status='completed' THEN 3 WHEN h.status='processing' THEN 2 ELSE 1 END * 1000000 + h.id) = best.best_score
      WHERE 1=1`;
    const params = [userId, userId];
    if (type) { query += ' AND h.type = ?'; params.push(type); }
    if (status) { query += ' AND h.status = ?'; params.push(status); }
    if (fav === '1') { query += ' AND h.favorite = 1'; }
    if (dateFrom) { query += " AND h.created_at >= ?"; params.push(dateFrom + ' 00:00:00'); }
    if (dateTo) { query += " AND h.created_at <= ?"; params.push(dateTo + ' 23:59:59'); }
    query += ' ORDER BY h.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await env.DB.prepare(query).bind(...params).all();

    // Stats: count unique prompts (deduplicated), not raw record count
    const counts = await env.DB.prepare(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN best_status='completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN best_status='failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN best_fav=1 THEN 1 ELSE 0 END) as favorites,
        SUM(CASE WHEN best_type LIKE '%video%' OR best_type='extend_video' THEN 1 ELSE 0 END) as videos,
        SUM(CASE WHEN best_type LIKE '%image%' THEN 1 ELSE 0 END) as images
      FROM (
        SELECT prompt, 
          MAX(CASE WHEN status='completed' THEN 'completed' WHEN status='processing' THEN 'processing' ELSE 'failed' END) as best_status,
          MAX(favorite) as best_fav,
          type as best_type
        FROM history WHERE user_id = ?
        GROUP BY prompt, type
      )`
    ).bind(userId).first();

    return jsonResponse({ history: rows.results, stats: counts });
  }

  // PUT /api/history/:id/favorite — toggle favorite
  const favMatch = path.match(/^\/api\/history\/(\d+)\/favorite$/);
  if (request.method === 'PUT' && favMatch) {
    const id = parseInt(favMatch[1]);
    const row = await env.DB.prepare('SELECT favorite FROM history WHERE id = ? AND user_id = ?').bind(id, userId).first();
    if (!row) return jsonResponse({ error: 'Không tìm thấy' }, 404);
    const newVal = row.favorite ? 0 : 1;
    await env.DB.prepare('UPDATE history SET favorite = ? WHERE id = ?').bind(newVal, id).run();
    return jsonResponse({ favorite: newVal });
  }

  // DELETE /api/history/:id
  const deleteMatch = path.match(/^\/api\/history\/(\d+)$/);
  if (request.method === 'DELETE' && deleteMatch) {
    const id = parseInt(deleteMatch[1]);
    await env.DB.prepare('DELETE FROM history WHERE id = ? AND user_id = ?').bind(id, userId).run();
    return jsonResponse({ message: 'Đã xóa' });
  }

  // POST /api/history/bulk — bulk operations (delete, favorite, unfavorite)
  if (request.method === 'POST' && path === '/api/history/bulk') {
    const { action, ids } = await request.json();
    if (!Array.isArray(ids) || !ids.length) return jsonResponse({ error: 'Thiếu danh sách ids' }, 400);

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
      return jsonResponse({ message: 'Đã yêu thích' });
    }
    if (action === 'unfavorite') {
      const stmts = chunks.map(chunk => {
        const ph = chunk.map(() => '?').join(',');
        return env.DB.prepare(`UPDATE history SET favorite = 0 WHERE id IN (${ph}) AND user_id = ?`).bind(...chunk, userId);
      });
      await env.DB.batch(stmts);
      return jsonResponse({ message: 'Đã bỏ yêu thích' });
    }
    return jsonResponse({ error: 'Hành động không hợp lệ' }, 400);
  }

  // POST /api/history/bulk-status — delete all items by status
  if (request.method === 'POST' && path === '/api/history/bulk-status') {
    const { action, status } = await request.json();
    if (!status) return jsonResponse({ error: 'Thiếu trạng thái' }, 400);
    if (action === 'delete') {
      const r = await env.DB.prepare('DELETE FROM history WHERE user_id = ? AND status = ?')
        .bind(userId, status).run();
      return jsonResponse({ message: `Đã xóa tất cả mục ${status}`, count: r.meta?.changes || 0 });
    }
    if (action === 'select_ids') {
      const rows = await env.DB.prepare('SELECT id FROM history WHERE user_id = ? AND status = ?')
        .bind(userId, status).all();
      return jsonResponse({ ids: rows.results.map(r => r.id) });
    }
    return jsonResponse({ error: 'Hành động không hợp lệ' }, 400);
  }

  return jsonResponse({ error: 'Không tìm thấy' }, 404);
}
