import { jsonResponse } from '../utils/response.js';

export async function handlePlans(request, env) {
  const rows = await env.DB.prepare('SELECT * FROM plans ORDER BY price ASC').all();
  return jsonResponse({ plans: rows.results });
}
