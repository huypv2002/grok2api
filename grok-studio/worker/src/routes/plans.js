import { jsonResponse } from '../utils/response.js';

export async function handlePlans(request, env) {
  const rows = await env.DB.prepare('SELECT * FROM plans ORDER BY price ASC').all();
  const sp = await env.DB.prepare('SELECT * FROM service_plans WHERE active = 1 ORDER BY sort_order ASC').all();
  return jsonResponse({ plans: rows.results, service_plans: sp.results });
}
