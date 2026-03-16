// ===== ADMIN DASHBOARD =====
function renderAdminDashboard() {
  return `<div class="page-header"><h2>Admin Dashboard</h2><p>System overview and statistics</p></div>
  <div class="stats-grid" id="stats-grid"><div class="spinner"></div></div>
  <div class="page-header" style="margin-top:12px"><h2 style="font-size:16px">Plan Distribution</h2></div>
  <div id="plan-dist" style="display:flex;gap:12px;flex-wrap:wrap"></div>`;
}

async function loadAdminStats() {
  try {
    const { stats } = await API.admin.getStats();
    document.getElementById('stats-grid').innerHTML = `
      <div class="glass-card stat-card"><div class="stat-value">${stats.totalUsers}</div><div class="stat-label">Total Users</div></div>
      <div class="glass-card stat-card"><div class="stat-value">${stats.totalAccounts}</div><div class="stat-label">SSO Tokens</div><div class="stat-sub">${stats.activeAccounts} active</div></div>
      <div class="glass-card stat-card"><div class="stat-value">${stats.totalGenerations}</div><div class="stat-label">Total Generations</div><div class="stat-sub">${stats.todayGenerations} today</div></div>
      <div class="glass-card stat-card"><div class="stat-value">${stats.completedGenerations}</div><div class="stat-label">Completed</div></div>
      <div class="glass-card stat-card"><div class="stat-value">${stats.failedGenerations}</div><div class="stat-label">Failed</div></div>`;
    const dist = document.getElementById('plan-dist');
    if (dist && stats.planDistribution) {
      dist.innerHTML = stats.planDistribution.map(p =>
        `<div class="glass-card" style="padding:16px 24px;text-align:center"><div style="font-size:24px;font-weight:700">${p.cnt}</div><div style="font-size:12px;color:var(--text-secondary);text-transform:uppercase">${p.plan}</div></div>`
      ).join('');
    }
  } catch (e) { showToast(e.message, 'error'); }
}

// ===== ADMIN USERS =====
function renderAdminUsers() {
  return `<div class="page-header"><h2>User Management</h2><p>Manage all registered users</p></div>
  <div class="admin-toolbar">
    <input type="text" id="admin-user-search" placeholder="Search email or name..." oninput="debounceAdminUsers()">
    <select id="admin-user-plan" onchange="loadAdminUsers()">
      <option value="">All Plans</option><option value="free">Free</option><option value="basic">Basic</option>
      <option value="pro">Pro</option><option value="unlimited">Unlimited</option>
    </select>
    <select id="admin-user-role" onchange="loadAdminUsers()">
      <option value="">All Roles</option><option value="user">User</option><option value="admin">Admin</option>
    </select>
  </div>
  <div class="glass-card" style="padding:0;overflow-x:auto">
    <table class="admin-table" id="admin-users-table">
      <thead><tr><th>ID</th><th>Email</th><th>Name</th><th>Plan</th><th>Role</th><th>Credits</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody id="admin-users-body"><tr><td colspan="8"><div class="spinner"></div></td></tr></tbody>
    </table>
  </div>
  <div id="user-modal"></div>`;
}

let _adminUserTimer;
function debounceAdminUsers() { clearTimeout(_adminUserTimer); _adminUserTimer = setTimeout(loadAdminUsers, 300); }

async function loadAdminUsers() {
  const search = document.getElementById('admin-user-search')?.value || '';
  const plan = document.getElementById('admin-user-plan')?.value || '';
  const role = document.getElementById('admin-user-role')?.value || '';
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (plan) params.set('plan', plan);
  if (role) params.set('role', role);
  const body = document.getElementById('admin-users-body');
  if (!body) return;
  try {
    const { users } = await API.admin.getUsers(params.toString());
    if (!users.length) { body.innerHTML = '<tr><td colspan="8" style="color:var(--text-muted)">No users found</td></tr>'; return; }
    body.innerHTML = users.map(u => `<tr>
      <td>${u.id}</td><td>${u.email}</td><td>${u.name || '-'}</td>
      <td><span class="type-badge">${u.plan}</span></td>
      <td><span class="type-badge" style="${u.role==='admin'?'color:var(--warning)':''}">${u.role || 'user'}</span></td>
      <td>${u.credits === -1 ? '∞' : u.credits}</td>
      <td style="font-size:11px;color:var(--text-muted)">${new Date(u.created_at).toLocaleDateString()}</td>
      <td class="actions">
        <button class="btn-secondary" style="padding:4px 10px;font-size:11px" onclick="editUserModal(${u.id},'${u.email}','${u.name||''}','${u.plan}','${u.role||'user'}',${u.credits})">Edit</button>
        ${u.id !== currentUser?.id ? `<button class="btn-secondary btn-danger" style="padding:4px 10px;font-size:11px" onclick="adminDeleteUser(${u.id})">Del</button>` : ''}
      </td>
    </tr>`).join('');
  } catch (e) { body.innerHTML = `<tr><td colspan="8" style="color:var(--error)">${e.message}</td></tr>`; }
}

function editUserModal(id, email, name, plan, role, credits) {
  document.getElementById('user-modal').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="glass-panel modal">
        <h3>Edit User</h3>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">${email}</div>
        <div class="form-group"><label>Name</label><input type="text" id="edit-name" value="${name}"></div>
        <div class="form-group"><label>Plan</label>
          <select id="edit-plan"><option value="free" ${plan==='free'?'selected':''}>Free</option><option value="basic" ${plan==='basic'?'selected':''}>Basic</option>
          <option value="pro" ${plan==='pro'?'selected':''}>Pro</option><option value="unlimited" ${plan==='unlimited'?'selected':''}>Unlimited</option></select>
        </div>
        <div class="form-group"><label>Role</label>
          <select id="edit-role"><option value="user" ${role==='user'?'selected':''}>User</option><option value="admin" ${role==='admin'?'selected':''}>Admin</option></select>
        </div>
        <div class="form-group"><label>Credits (-1 = unlimited)</label><input type="number" id="edit-credits" value="${credits}"></div>
        <div class="form-group"><label>New Password (leave empty to keep)</label><input type="password" id="edit-password" placeholder=""></div>
        <div class="modal-actions">
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn-primary" onclick="saveUser(${id})">Save</button>
        </div>
      </div>
    </div>`;
}

function closeModal() {
  document.getElementById('user-modal')?.replaceChildren();
  const am = document.getElementById('account-modal');
  if (am) am.replaceChildren();
}

async function saveUser(id) {
  const data = {
    name: document.getElementById('edit-name').value,
    plan: document.getElementById('edit-plan').value,
    role: document.getElementById('edit-role').value,
    credits: parseInt(document.getElementById('edit-credits').value),
  };
  const pw = document.getElementById('edit-password').value;
  if (pw) data.password = pw;
  try {
    await API.admin.updateUser(id, data);
    showToast('User updated', 'success');
    closeModal();
    loadAdminUsers();
  } catch (e) { showToast(e.message, 'error'); }
}

async function adminDeleteUser(id) {
  if (!confirm('Delete this user and all their data?')) return;
  try { await API.admin.deleteUser(id); showToast('User deleted', 'success'); loadAdminUsers(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ===== ADMIN ACCOUNTS (ALL SSO TOKENS) =====
function renderAdminAccounts() {
  return `<div class="page-header"><h2>All SSO Tokens</h2><p>Manage all Grok accounts across users</p></div>
  <div class="admin-toolbar">
    <select id="admin-acc-status" onchange="loadAdminAccounts()">
      <option value="">All Status</option><option value="active">Active</option>
      <option value="limited">Limited</option><option value="invalid">Invalid</option>
    </select>
  </div>
  <div class="glass-card" style="padding:0;overflow-x:auto">
    <table class="admin-table">
      <thead><tr><th>ID</th><th>User</th><th>Label</th><th>Token</th><th>Status</th><th>Last Used</th><th>Actions</th></tr></thead>
      <tbody id="admin-acc-body"><tr><td colspan="7"><div class="spinner"></div></td></tr></tbody>
    </table>
  </div>
  <div id="account-modal"></div>`;
}

async function loadAdminAccounts() {
  const status = document.getElementById('admin-acc-status')?.value || '';
  const params = status ? `status=${status}` : '';
  const body = document.getElementById('admin-acc-body');
  if (!body) return;
  try {
    const { accounts } = await API.admin.getAccounts(params);
    if (!accounts.length) { body.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted)">No accounts</td></tr>'; return; }
    body.innerHTML = accounts.map(a => `<tr>
      <td>${a.id}</td><td style="font-size:12px">${a.user_email}</td><td>${a.label || '-'}</td>
      <td style="font-family:monospace;font-size:11px;color:var(--text-secondary)">${a.token_preview}</td>
      <td><span class="account-status ${a.status}" style="font-size:11px;padding:2px 8px;border-radius:20px">${a.status}</span></td>
      <td style="font-size:11px;color:var(--text-muted)">${a.last_used ? new Date(a.last_used).toLocaleString() : 'Never'}</td>
      <td class="actions">
        <button class="btn-secondary" style="padding:4px 10px;font-size:11px" onclick="editAccountModal(${a.id},'${a.label||''}','${a.status}')">Edit</button>
        <button class="btn-secondary btn-danger" style="padding:4px 10px;font-size:11px" onclick="adminDeleteAccount(${a.id})">Del</button>
      </td>
    </tr>`).join('');
  } catch (e) { body.innerHTML = `<tr><td colspan="7" style="color:var(--error)">${e.message}</td></tr>`; }
}

function editAccountModal(id, label, status) {
  document.getElementById('account-modal').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="glass-panel modal">
        <h3>Edit Account</h3>
        <div class="form-group"><label>Label</label><input type="text" id="edit-acc-label" value="${label}"></div>
        <div class="form-group"><label>Status</label>
          <select id="edit-acc-status"><option value="active" ${status==='active'?'selected':''}>Active</option>
          <option value="limited" ${status==='limited'?'selected':''}>Limited</option>
          <option value="invalid" ${status==='invalid'?'selected':''}>Invalid</option></select>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn-primary" onclick="saveAccount(${id})">Save</button>
        </div>
      </div>
    </div>`;
}

async function saveAccount(id) {
  try {
    await API.admin.updateAccount(id, {
      label: document.getElementById('edit-acc-label').value,
      status: document.getElementById('edit-acc-status').value,
    });
    showToast('Account updated', 'success');
    closeModal();
    loadAdminAccounts();
  } catch (e) { showToast(e.message, 'error'); }
}

async function adminDeleteAccount(id) {
  if (!confirm('Delete this SSO token?')) return;
  try { await API.admin.deleteAccount(id); showToast('Deleted', 'success'); loadAdminAccounts(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ===== ADMIN HISTORY =====
function renderAdminHistory() {
  return `<div class="page-header"><h2>All History</h2><p>Generation history across all users</p></div>
  <div class="admin-toolbar">
    <select id="admin-hist-type" onchange="loadAdminHistory()">
      <option value="">All Types</option><option value="text2video">Text→Video</option>
      <option value="image2video">Image→Video</option><option value="text2image">Text→Image</option>
      <option value="image2image">Image→Image</option><option value="extend_video">Extend</option>
    </select>
    <select id="admin-hist-status" onchange="loadAdminHistory()">
      <option value="">All Status</option><option value="completed">Completed</option>
      <option value="failed">Failed</option><option value="processing">Processing</option>
    </select>
  </div>
  <div class="glass-card" style="padding:0;overflow-x:auto">
    <table class="admin-table">
      <thead><tr><th>ID</th><th>User</th><th>Type</th><th>Prompt</th><th>Status</th><th>Created</th><th>Output</th></tr></thead>
      <tbody id="admin-hist-body"><tr><td colspan="7"><div class="spinner"></div></td></tr></tbody>
    </table>
  </div>`;
}

async function loadAdminHistory() {
  const type = document.getElementById('admin-hist-type')?.value || '';
  const status = document.getElementById('admin-hist-status')?.value || '';
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (status) params.set('status', status);
  params.set('limit', '100');
  const body = document.getElementById('admin-hist-body');
  if (!body) return;
  try {
    const { history } = await API.admin.getHistory(params.toString());
    if (!history.length) { body.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted)">No history</td></tr>'; return; }
    body.innerHTML = history.map(h => {
      const typeLabel = {text2video:'T→V',image2video:'I→V',text2image:'T→I',image2image:'I→I',extend_video:'Ext'}[h.type]||h.type;
      const promptShort = (h.prompt||'').substring(0, 60) + ((h.prompt||'').length > 60 ? '...' : '');
      const hasOutput = h.output_url && h.output_url.startsWith('http');
      return `<tr>
        <td>${h.id}</td><td style="font-size:12px">${h.user_email}</td>
        <td><span class="type-badge">${typeLabel}</span></td>
        <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(h.prompt||'').replace(/"/g,'&quot;')}">${promptShort}</td>
        <td><span class="status-dot ${h.status}"></span>${h.status}</td>
        <td style="font-size:11px;color:var(--text-muted)">${new Date(h.created_at).toLocaleString()}</td>
        <td>${hasOutput ? `<a href="${h.output_url}" target="_blank" style="color:var(--text-secondary);font-size:11px">View</a>` : '-'}</td>
      </tr>`;
    }).join('');
  } catch (e) { body.innerHTML = `<tr><td colspan="7" style="color:var(--error)">${e.message}</td></tr>`; }
}

// ===== ADMIN PLANS =====
function renderAdminPlans() {
  return `<div class="page-header"><h2>Plans Management</h2><p>Configure subscription plans</p></div>
  <div id="admin-plans-list" class="stats-grid"><div class="spinner"></div></div>
  <div id="plan-modal"></div>`;
}

async function loadAdminPlans() {
  const container = document.getElementById('admin-plans-list');
  if (!container) return;
  try {
    const { plans } = await API.getPlans();
    container.innerHTML = plans.map(p => {
      const features = JSON.parse(p.features || '{}');
      const featureList = Object.entries(features).map(([k,v]) => `<div style="font-size:11px;color:${v?'var(--success)':'var(--text-muted)'}">${v?'✓':'✕'} ${k}</div>`).join('');
      return `<div class="glass-card" style="text-align:left">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-size:18px;font-weight:600">${p.name}</div>
          <button class="btn-secondary" style="padding:4px 12px;font-size:11px" onclick='editPlanModal(${JSON.stringify(p).replace(/'/g,"&#39;")})'>Edit</button>
        </div>
        <div style="font-size:28px;font-weight:700">$${p.price}<span style="font-size:13px;color:var(--text-secondary);font-weight:400">/mo</span></div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-secondary)">${p.credits_per_month === -1 ? 'Unlimited' : p.credits_per_month} credits · ${p.max_accounts} accounts</div>
        <div style="margin-top:12px">${featureList}</div>
      </div>`;
    }).join('');
  } catch (e) { container.innerHTML = `<p style="color:var(--error)">${e.message}</p>`; }
}

function editPlanModal(plan) {
  const features = typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features;
  const featureChecks = ['text2image','image2image','text2video','image2video','extend_video'].map(f =>
    `<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
      <input type="checkbox" id="pf-${f}" ${features[f]?'checked':''}> ${f}
    </label>`
  ).join('');

  const modal = document.getElementById('plan-modal');
  modal.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closePlanModal()">
      <div class="glass-panel modal">
        <h3>Edit Plan: ${plan.name}</h3>
        <div class="form-group"><label>Name</label><input type="text" id="edit-plan-name" value="${plan.name}"></div>
        <div class="form-group"><label>Price ($/mo)</label><input type="number" id="edit-plan-price" value="${plan.price}" step="0.01"></div>
        <div class="form-group"><label>Credits/month (-1 = unlimited)</label><input type="number" id="edit-plan-credits" value="${plan.credits_per_month}"></div>
        <div class="form-group"><label>Max Accounts</label><input type="number" id="edit-plan-accounts" value="${plan.max_accounts}"></div>
        <div class="form-group"><label>Features</label><div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">${featureChecks}</div></div>
        <div class="modal-actions">
          <button class="btn-secondary" onclick="closePlanModal()">Cancel</button>
          <button class="btn-primary" onclick="savePlan('${plan.id}')">Save</button>
        </div>
      </div>
    </div>`;
}

function closePlanModal() { document.getElementById('plan-modal')?.replaceChildren(); }

async function savePlan(id) {
  const features = {};
  ['text2image','image2image','text2video','image2video','extend_video'].forEach(f => {
    features[f] = document.getElementById(`pf-${f}`).checked;
  });
  try {
    await API.admin.updatePlan(id, {
      name: document.getElementById('edit-plan-name').value,
      price: parseFloat(document.getElementById('edit-plan-price').value),
      credits_per_month: parseInt(document.getElementById('edit-plan-credits').value),
      max_accounts: parseInt(document.getElementById('edit-plan-accounts').value),
      features,
    });
    showToast('Plan updated', 'success');
    closePlanModal();
    loadAdminPlans();
  } catch (e) { showToast(e.message, 'error'); }
}
