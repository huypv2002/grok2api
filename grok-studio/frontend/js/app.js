// State
let currentUser = null;
let currentPage = 'text2video';

// Toast
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// Auth
function showRegister() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'flex';
  document.getElementById('auth-error').textContent = '';
}
function showLogin() {
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'flex';
  document.getElementById('auth-error').textContent = '';
}

async function login() {
  const email = document.getElementById('login-email').value;
  const pw = document.getElementById('login-password').value;
  try {
    const data = await API.login(email, pw);
    API.setToken(data.token);
    API.saveUser(data.user);
    currentUser = data.user;
    enterApp();
  } catch (e) {
    document.getElementById('auth-error').textContent = e.message;
  }
}

async function register() {
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const pw = document.getElementById('reg-password').value;
  try {
    const data = await API.register(email, pw, name);
    API.setToken(data.token);
    API.saveUser(data.user);
    currentUser = data.user;
    enterApp();
  } catch (e) {
    document.getElementById('auth-error').textContent = e.message;
  }
}

function logout() {
  API.clearToken();
  currentUser = null;
  document.getElementById('main-screen').classList.remove('active');
  document.getElementById('auth-screen').classList.add('active');
}

function enterApp() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('main-screen').classList.add('active');
  updateUserInfo();
  updateAdminNav();
  switchPage(currentPage);
}

function updateUserInfo() {
  if (!currentUser) return;
  document.getElementById('user-name').textContent = currentUser.name || currentUser.email;
  document.getElementById('user-plan').textContent = currentUser.role === 'admin' ? '★ Admin' : currentUser.plan;
  document.getElementById('user-avatar').textContent = (currentUser.name || currentUser.email)[0].toUpperCase();
}

function updateAdminNav() {
  const adminNav = document.getElementById('admin-nav');
  if (!adminNav) return;
  adminNav.style.display = (currentUser?.role === 'admin') ? 'flex' : 'none';
}

function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  renderPage(page);
}

// Session check - 24h expiry
(async function init() {
  if (API.isSessionValid()) {
    // Try cached user first for instant load
    const cached = API.getSavedUser();
    if (cached) {
      currentUser = cached;
      enterApp();
    }
    // Then refresh from server
    try {
      const data = await API.me();
      currentUser = data.user;
      API.saveUser(data.user);
      updateUserInfo();
      updateAdminNav();
    } catch {
      API.clearToken();
      currentUser = null;
      document.getElementById('main-screen').classList.remove('active');
      document.getElementById('auth-screen').classList.add('active');
    }
  } else {
    API.clearToken();
  }
})();
