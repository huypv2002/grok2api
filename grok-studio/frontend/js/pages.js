// Page Renderer
function renderPage(page) {
  const el = document.getElementById('content');
  switch (page) {
    case 'text2video': el.innerHTML = renderText2Video(); break;
    case 'image2video': el.innerHTML = renderImage2Video(); break;
    case 'text2image': el.innerHTML = renderText2Image(); break;
    case 'image2image': el.innerHTML = renderImage2Image(); break;
    case 'extend': el.innerHTML = renderExtendVideo(); break;
    case 'history': el.innerHTML = renderHistoryPage(); loadHistory(); break;
    case 'accounts': el.innerHTML = renderAccountsPage(); loadAccounts(); break;
    // Admin pages
    case 'admin-dashboard': el.innerHTML = renderAdminDashboard(); loadAdminStats(); break;
    case 'admin-users': el.innerHTML = renderAdminUsers(); loadAdminUsers(); break;
    case 'admin-accounts': el.innerHTML = renderAdminAccounts(); loadAdminAccounts(); break;
    case 'admin-history': el.innerHTML = renderAdminHistory(); loadAdminHistory(); break;
    case 'admin-plans': el.innerHTML = renderAdminPlans(); loadAdminPlans(); break;
  }
}

// Galaxy SVG icons
const galaxyStars = `<svg viewBox="0 0 80 80" width="48" height="48" opacity="0.2">
  <circle cx="40" cy="40" r="3" fill="#fff"/><circle cx="20" cy="20" r="1.5" fill="#fff" opacity="0.5"/>
  <circle cx="60" cy="25" r="1" fill="#fff" opacity="0.4"/><circle cx="25" cy="58" r="1.2" fill="#fff" opacity="0.6"/>
  <circle cx="58" cy="55" r="1.8" fill="#fff" opacity="0.3"/><circle cx="40" cy="15" r="0.8" fill="#fff" opacity="0.4"/>
  <ellipse cx="40" cy="40" rx="30" ry="12" fill="none" stroke="#fff" stroke-width="0.5" opacity="0.15" transform="rotate(-25 40 40)"/>
</svg>`;

function genFormOptions(type) {
  const aspectOpts = `<option value="3:2">3:2 (Landscape)</option><option value="16:9">16:9 (Wide)</option>
    <option value="9:16">9:16 (Portrait)</option><option value="2:3">2:3 (Tall)</option><option value="1:1">1:1 (Square)</option>`;
  const resOpts = `<option value="480p">480p (Standard)</option><option value="720p">720p (HD)</option>`;
  const lenOpts = `<option value="6">6s</option><option value="12">12s</option><option value="18">18s</option><option value="24">24s</option><option value="30">30s</option>`;
  const sizeOpts = `<option value="1024x1024">1024×1024</option><option value="1792x1024">1792×1024</option>
    <option value="1024x1792">1024×1792</option><option value="1280x720">1280×720</option><option value="720x1280">720×1280</option>`;
  const nOpts = `<option value="1">1</option><option value="2">2</option><option value="4">4</option>`;

  if (type === 'video') return `
    <div class="form-row">
      <div class="form-group"><label>Aspect Ratio</label><select id="gen-aspect">${aspectOpts}</select></div>
      <div class="form-group"><label>Resolution</label><select id="gen-resolution">${resOpts}</select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Duration</label><select id="gen-length">${lenOpts}</select></div>
      <div class="form-group"></div>
    </div>`;
  if (type === 'image') return `
    <div class="form-row">
      <div class="form-group"><label>Size</label><select id="gen-size">${sizeOpts}</select></div>
      <div class="form-group"><label>Count</label><select id="gen-n">${nOpts}</select></div>
    </div>`;
  return '';
}

// ===== TEXT TO VIDEO =====
function renderText2Video() {
  return `<div class="page-header"><h2>Text → Video</h2><p>Generate videos from text prompts using Grok AI</p></div>
  <div class="gen-layout">
    <div class="gen-form glass-card">
      <div class="form-group"><label>Prompt</label>
        <textarea id="gen-prompt" placeholder="Describe the video you want to create..."></textarea>
      </div>
      ${genFormOptions('video')}
      <button class="btn-primary" id="gen-btn" onclick="doGenerate('text2video')">
        <span id="gen-btn-text">Generate Video</span>
      </button>
      <div id="batch-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">
          <label style="font-size:12px;color:var(--text-secondary)">BATCH MODE</label>
          <button class="btn-secondary" onclick="addBatchItem()" style="font-size:12px;padding:6px 12px">+ Add Prompt</button>
        </div>
        <div id="batch-list" class="batch-queue"></div>
        <button class="btn-secondary" id="batch-btn" onclick="doBatchGenerate('text2video')" style="width:100%;margin-top:8px;display:none">
          Generate All
        </button>
      </div>
    </div>
    <div class="gen-preview">
      <div class="preview-box" id="preview-box">
        <div class="preview-placeholder">${galaxyStars}<span>Preview will appear here</span></div>
      </div>
      <div id="gen-status" style="font-size:13px;color:var(--text-secondary)"></div>
    </div>
  </div>`;
}

// ===== IMAGE TO VIDEO =====
function renderImage2Video() {
  return `<div class="page-header"><h2>Image → Video</h2><p>Animate images into videos with AI</p></div>
  <div class="gen-layout">
    <div class="gen-form glass-card">
      <div class="form-group"><label>Reference Image</label>
        <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()">
          <input type="file" id="file-input" accept="image/*" onchange="handleFileUpload(this)">
          <p>Click or drag image here</p>
          <div class="file-name" id="file-name"></div>
        </div>
      </div>
      <div class="form-group"><label>Prompt</label>
        <textarea id="gen-prompt" placeholder="Describe the motion and animation..."></textarea>
      </div>
      ${genFormOptions('video')}
      <button class="btn-primary" id="gen-btn" onclick="doGenerate('image2video')">Generate Video</button>
    </div>
    <div class="gen-preview">
      <div class="preview-box" id="preview-box">
        <div class="preview-placeholder">${galaxyStars}<span>Preview will appear here</span></div>
      </div>
      <div id="gen-status" style="font-size:13px;color:var(--text-secondary)"></div>
    </div>
  </div>`;
}

// ===== TEXT TO IMAGE =====
function renderText2Image() {
  return `<div class="page-header"><h2>Text → Image</h2><p>Create stunning images from text descriptions</p></div>
  <div class="gen-layout">
    <div class="gen-form glass-card">
      <div class="form-group"><label>Prompt</label>
        <textarea id="gen-prompt" placeholder="Describe the image you want to create..."></textarea>
      </div>
      ${genFormOptions('image')}
      <button class="btn-primary" id="gen-btn" onclick="doGenerate('text2image')">Generate Image</button>
      <div id="batch-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">
          <label style="font-size:12px;color:var(--text-secondary)">BATCH MODE</label>
          <button class="btn-secondary" onclick="addBatchItem()" style="font-size:12px;padding:6px 12px">+ Add Prompt</button>
        </div>
        <div id="batch-list" class="batch-queue"></div>
        <button class="btn-secondary" id="batch-btn" onclick="doBatchGenerate('text2image')" style="width:100%;margin-top:8px;display:none">
          Generate All
        </button>
      </div>
    </div>
    <div class="gen-preview">
      <div class="preview-box" id="preview-box">
        <div class="preview-placeholder">${galaxyStars}<span>Preview will appear here</span></div>
      </div>
      <div id="gen-status" style="font-size:13px;color:var(--text-secondary)"></div>
    </div>
  </div>`;
}

// ===== IMAGE TO IMAGE =====
function renderImage2Image() {
  return `<div class="page-header"><h2>Image → Image</h2><p>Edit and transform images with AI</p></div>
  <div class="gen-layout">
    <div class="gen-form glass-card">
      <div class="form-group"><label>Source Image</label>
        <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()">
          <input type="file" id="file-input" accept="image/*" onchange="handleFileUpload(this)">
          <p>Click or drag image here</p>
          <div class="file-name" id="file-name"></div>
        </div>
      </div>
      <div class="form-group"><label>Edit Prompt</label>
        <textarea id="gen-prompt" placeholder="Describe how to edit the image..."></textarea>
      </div>
      ${genFormOptions('image')}
      <button class="btn-primary" id="gen-btn" onclick="doGenerate('image2image')">Transform Image</button>
    </div>
    <div class="gen-preview">
      <div class="preview-box" id="preview-box">
        <div class="preview-placeholder">${galaxyStars}<span>Preview will appear here</span></div>
      </div>
      <div id="gen-status" style="font-size:13px;color:var(--text-secondary)"></div>
    </div>
  </div>`;
}

// ===== EXTEND VIDEO =====
function renderExtendVideo() {
  return `<div class="page-header"><h2>Extend Video</h2><p>Extend existing videos with AI continuation</p></div>
  <div class="gen-layout">
    <div class="gen-form glass-card">
      <div class="form-group"><label>Reference Video ID</label>
        <input type="text" id="gen-ref-id" placeholder="Paste the video reference ID...">
      </div>
      <div class="form-group"><label>Prompt</label>
        <textarea id="gen-prompt" placeholder="Describe how the video should continue..."></textarea>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Start Time (s)</label>
          <input type="number" id="gen-start-time" value="0" min="0" step="0.1">
        </div>
        <div class="form-group"><label>Extension Length</label>
          <select id="gen-length">
            <option value="6">6s</option><option value="12">12s</option><option value="18">18s</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Aspect Ratio</label>
          <select id="gen-aspect">
            <option value="3:2">3:2</option><option value="16:9">16:9</option>
            <option value="9:16">9:16</option><option value="2:3">2:3</option><option value="1:1">1:1</option>
          </select>
        </div>
        <div class="form-group"><label>Resolution</label>
          <select id="gen-resolution">
            <option value="480p">480p</option><option value="720p">720p</option>
          </select>
        </div>
      </div>
      <button class="btn-primary" id="gen-btn" onclick="doGenerate('extend_video')">Extend Video</button>
    </div>
    <div class="gen-preview">
      <div class="preview-box" id="preview-box">
        <div class="preview-placeholder">${galaxyStars}<span>Preview will appear here</span></div>
      </div>
      <div id="gen-status" style="font-size:13px;color:var(--text-secondary)"></div>
    </div>
  </div>`;
}

// ===== HISTORY =====
function renderHistoryPage() {
  return `<div class="page-header"><h2>History</h2><p>Your generation history</p></div>
  <div class="history-filters" id="history-filters">
    <button class="filter-btn active" onclick="filterHistory(null, this)">All</button>
    <button class="filter-btn" onclick="filterHistory('text2video', this)">Text→Video</button>
    <button class="filter-btn" onclick="filterHistory('image2video', this)">Image→Video</button>
    <button class="filter-btn" onclick="filterHistory('text2image', this)">Text→Image</button>
    <button class="filter-btn" onclick="filterHistory('image2image', this)">Image→Image</button>
    <button class="filter-btn" onclick="filterHistory('extend_video', this)">Extend</button>
  </div>
  <div class="history-grid" id="history-grid"><div class="spinner"></div></div>`;
}

// ===== ACCOUNTS =====
function renderAccountsPage() {
  return `<div class="page-header"><h2>Grok Accounts</h2><p>Manage your Grok SSO tokens</p></div>
  <div class="add-account-form">
    <input type="text" id="new-token" placeholder="Paste SSO token (sso=xxx...)">
    <input type="text" id="new-label" placeholder="Label (optional)" style="max-width:160px">
    <button class="btn-primary" onclick="addAccount()" style="width:auto;padding:12px 24px">Add</button>
  </div>
  <div class="accounts-list" id="accounts-list"><div class="spinner"></div></div>`;
}

// ===== ACTIONS =====
let uploadedFileData = null;
let batchItems = [];

function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedFileData = e.target.result;
    const zone = document.getElementById('upload-zone');
    if (zone) zone.classList.add('has-file');
    const fname = document.getElementById('file-name');
    if (fname) fname.textContent = file.name;
    // Show preview
    const box = document.getElementById('preview-box');
    if (box) box.innerHTML = `<img src="${uploadedFileData}" alt="Preview">`;
  };
  reader.readAsDataURL(file);
}

async function doGenerate(type) {
  const prompt = document.getElementById('gen-prompt')?.value?.trim();
  if (!prompt) { showToast('Please enter a prompt', 'error'); return; }

  const btn = document.getElementById('gen-btn');
  const status = document.getElementById('gen-status');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  if (status) status.textContent = 'Generating... This may take a moment.';

  const params = { type, prompt };

  // Collect options based on type
  if (type === 'text2video' || type === 'image2video') {
    params.aspect_ratio = document.getElementById('gen-aspect')?.value || '3:2';
    params.resolution = document.getElementById('gen-resolution')?.value || '480p';
    params.video_length = parseInt(document.getElementById('gen-length')?.value || '6');
  }
  if (type === 'text2image' || type === 'image2image') {
    params.size = document.getElementById('gen-size')?.value || '1024x1024';
    params.n = parseInt(document.getElementById('gen-n')?.value || '1');
  }
  if (type === 'image2video' || type === 'image2image') {
    if (!uploadedFileData) { showToast('Please upload an image', 'error'); btn.disabled = false; btn.innerHTML = 'Generate'; return; }
    params.image_url = uploadedFileData;
  }
  if (type === 'extend_video') {
    params.reference_id = document.getElementById('gen-ref-id')?.value?.trim();
    params.start_time = parseFloat(document.getElementById('gen-start-time')?.value || '0');
    params.aspect_ratio = document.getElementById('gen-aspect')?.value || '3:2';
    params.resolution = document.getElementById('gen-resolution')?.value || '480p';
    params.video_length = parseInt(document.getElementById('gen-length')?.value || '6');
    if (!params.reference_id) { showToast('Please enter a reference ID', 'error'); btn.disabled = false; btn.innerHTML = 'Extend Video'; return; }
  }

  try {
    const data = await API.generate(params);
    if (status) status.textContent = 'Done!';
    showToast('Generation complete', 'success');
    displayResult(type, data.outputUrl);
  } catch (e) {
    if (status) status.textContent = '';
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
    const labels = { text2video: 'Generate Video', image2video: 'Generate Video', text2image: 'Generate Image', image2image: 'Transform Image', extend_video: 'Extend Video' };
    btn.innerHTML = labels[type] || 'Generate';
  }
}

function displayResult(type, url) {
  const box = document.getElementById('preview-box');
  if (!box || !url) return;
  if (type.includes('video') || type === 'extend_video') {
    box.innerHTML = `<video src="${url}" controls autoplay loop style="width:100%;height:100%;object-fit:contain"></video>`;
  } else if (url.startsWith('data:') || url.match(/\.(png|jpg|jpeg|webp|gif)/i)) {
    box.innerHTML = `<img src="${url}" alt="Generated" style="width:100%;height:100%;object-fit:contain">`;
  } else {
    box.innerHTML = `<div style="padding:20px;font-size:13px;color:var(--text-secondary);word-break:break-all">${url}</div>`;
  }
}

// ===== BATCH =====
function addBatchItem() {
  const prompt = document.getElementById('gen-prompt')?.value?.trim();
  if (!prompt) { showToast('Enter a prompt first', 'error'); return; }
  batchItems.push(prompt);
  document.getElementById('gen-prompt').value = '';
  renderBatchList();
}

function removeBatchItem(idx) {
  batchItems.splice(idx, 1);
  renderBatchList();
}

function renderBatchList() {
  const list = document.getElementById('batch-list');
  const btn = document.getElementById('batch-btn');
  if (!list) return;
  if (batchItems.length === 0) { list.innerHTML = ''; if (btn) btn.style.display = 'none'; return; }
  if (btn) btn.style.display = 'block';
  list.innerHTML = batchItems.map((p, i) => `
    <div class="queue-item">
      <span class="queue-num">${i + 1}</span>
      <span class="queue-prompt">${p}</span>
      <span class="queue-status" id="batch-status-${i}">Pending</span>
      <button class="btn-icon" onclick="removeBatchItem(${i})">✕</button>
    </div>
  `).join('');
}

async function doBatchGenerate(type) {
  if (batchItems.length === 0) return;
  const btn = document.getElementById('batch-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

  for (let i = 0; i < batchItems.length; i++) {
    const statusEl = document.getElementById(`batch-status-${i}`);
    if (statusEl) statusEl.innerHTML = '<span class="spinner" style="width:14px;height:14px"></span>';

    const params = { type, prompt: batchItems[i] };
    if (type === 'text2video') {
      params.aspect_ratio = document.getElementById('gen-aspect')?.value || '3:2';
      params.resolution = document.getElementById('gen-resolution')?.value || '480p';
      params.video_length = parseInt(document.getElementById('gen-length')?.value || '6');
    }
    if (type === 'text2image') {
      params.size = document.getElementById('gen-size')?.value || '1024x1024';
      params.n = parseInt(document.getElementById('gen-n')?.value || '1');
    }

    try {
      const data = await API.generate(params);
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--success)">✓ Done</span>';
      displayResult(type, data.outputUrl);
    } catch (e) {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--error)">✕ ${e.message}</span>`;
    }
  }

  batchItems = [];
  if (btn) { btn.disabled = false; btn.textContent = 'Generate All'; btn.style.display = 'none'; }
  showToast('Batch complete', 'success');
}

// ===== HISTORY LOAD =====
let historyFilter = null;

async function loadHistory() {
  const grid = document.getElementById('history-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="spinner"></div>';
  try {
    const data = await API.getHistory(historyFilter);
    if (!data.history?.length) { grid.innerHTML = '<p style="color:var(--text-muted)">No history yet</p>'; return; }
    grid.innerHTML = data.history.map(h => {
      const isVideo = h.type.includes('video') || h.type === 'extend_video';
      const thumb = h.output_url
        ? (isVideo ? `<video src="${h.output_url}" muted preload="metadata"></video>` : `<img src="${h.output_url}" alt="">`)
        : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted)">${h.status === 'failed' ? '✕' : '...'}</div>`;
      const typeLabel = { text2video:'T→V', image2video:'I→V', text2image:'T→I', image2image:'I→I', extend_video:'Ext' }[h.type] || h.type;
      const time = new Date(h.created_at).toLocaleDateString();
      return `<div class="glass-card history-card" onclick="viewHistoryItem(${h.id}, '${h.output_url || ''}', ${isVideo})">
        <div class="thumb">${thumb}</div>
        <div class="meta">
          <span class="type-badge">${typeLabel}</span>
          <span><span class="status-dot ${h.status}"></span>${h.status}</span>
        </div>
        <div class="prompt-text">${h.prompt}</div>
        <div class="time">${time}</div>
      </div>`;
    }).join('');
  } catch (e) { grid.innerHTML = `<p style="color:var(--error)">${e.message}</p>`; }
}

function filterHistory(type, btn) {
  historyFilter = type;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadHistory();
}

function viewHistoryItem(id, url, isVideo) {
  if (!url) return;
  const w = window.open('', '_blank');
  if (isVideo) w.document.write(`<video src="${url}" controls autoplay style="max-width:100%;max-height:100vh"></video>`);
  else w.document.write(`<img src="${url}" style="max-width:100%;max-height:100vh">`);
}

// ===== ACCOUNTS LOAD =====
async function loadAccounts() {
  const list = document.getElementById('accounts-list');
  if (!list) return;
  list.innerHTML = '<div class="spinner"></div>';
  try {
    const data = await API.getAccounts();
    if (!data.accounts?.length) { list.innerHTML = '<p style="color:var(--text-muted)">No accounts added yet</p>'; return; }
    list.innerHTML = data.accounts.map(a => `
      <div class="glass-card account-card">
        <div style="flex:1">
          <div style="font-size:14px;font-weight:500;margin-bottom:4px">${a.label || 'Unnamed'}</div>
          <div class="token-preview">${a.token_preview}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${a.last_used ? 'Last used: ' + new Date(a.last_used).toLocaleString() : 'Never used'}</div>
        </div>
        <span class="account-status ${a.status}">${a.status}</span>
        <button class="btn-icon btn-danger" onclick="deleteAccount(${a.id})" title="Remove">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14"/></svg>
        </button>
      </div>
    `).join('');
  } catch (e) { list.innerHTML = `<p style="color:var(--error)">${e.message}</p>`; }
}

async function addAccount() {
  const token = document.getElementById('new-token')?.value?.trim();
  const label = document.getElementById('new-label')?.value?.trim();
  if (!token) { showToast('Please paste an SSO token', 'error'); return; }
  try {
    await API.addAccount(token, label);
    showToast('Account added', 'success');
    document.getElementById('new-token').value = '';
    document.getElementById('new-label').value = '';
    loadAccounts();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteAccount(id) {
  if (!confirm('Remove this account?')) return;
  try {
    await API.deleteAccount(id);
    showToast('Account removed', 'success');
    loadAccounts();
  } catch (e) { showToast(e.message, 'error'); }
}
