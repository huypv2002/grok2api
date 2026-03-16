// API Client
const API = {
  base: '/api',
  token: localStorage.getItem('grok_studio_token'),

  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const resp = await fetch(`${this.base}${path}`, { ...options, headers });
    const data = await resp.json();
    if (resp.status === 401) { this.clearToken(); location.reload(); throw new Error('Session expired'); }
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    return data;
  },

  setToken(token) {
    this.token = token;
    localStorage.setItem('grok_studio_token', token);
    localStorage.setItem('grok_studio_token_time', Date.now().toString());
  },
  clearToken() {
    this.token = null;
    localStorage.removeItem('grok_studio_token');
    localStorage.removeItem('grok_studio_token_time');
    localStorage.removeItem('grok_studio_user');
  },
  isSessionValid() {
    const time = localStorage.getItem('grok_studio_token_time');
    if (!time || !this.token) return false;
    return (Date.now() - parseInt(time)) < 86400000; // 24h
  },
  saveUser(user) { localStorage.setItem('grok_studio_user', JSON.stringify(user)); },
  getSavedUser() { try { return JSON.parse(localStorage.getItem('grok_studio_user')); } catch { return null; } },

  // Auth
  login: (email, password) => API.request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email, password, name) => API.request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  me: () => API.request('/auth/me', { method: 'POST' }),

  // Accounts
  getAccounts: () => API.request('/accounts'),
  addAccount: (sso_token, label) => API.request('/accounts', { method: 'POST', body: JSON.stringify({ sso_token, label }) }),
  deleteAccount: (id) => API.request(`/accounts/${id}`, { method: 'DELETE' }),

  // Generate
  generate: (params) => API.request('/generate', { method: 'POST', body: JSON.stringify(params) }),

  // History
  getHistory: (type, limit = 50) => API.request(`/history?${type ? `type=${type}&` : ''}limit=${limit}`),
  deleteHistory: (id) => API.request(`/history/${id}`, { method: 'DELETE' }),

  // Plans
  getPlans: () => API.request('/plans'),

  // Admin
  admin: {
    getStats: () => API.request('/admin/stats'),
    getUsers: (params = '') => API.request(`/admin/users?${params}`),
    updateUser: (id, data) => API.request(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteUser: (id) => API.request(`/admin/users/${id}`, { method: 'DELETE' }),
    getAccounts: (params = '') => API.request(`/admin/accounts?${params}`),
    updateAccount: (id, data) => API.request(`/admin/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteAccount: (id) => API.request(`/admin/accounts/${id}`, { method: 'DELETE' }),
    getHistory: (params = '') => API.request(`/admin/history?${params}`),
    updatePlan: (id, data) => API.request(`/admin/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
};
