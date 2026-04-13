/* ═══════════════════════════════════════════════
   PHANTOM TV — Common JS Utilities
   ═══════════════════════════════════════════════ */

const API = '/api';

// ─── AUTH TOKEN ────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('phantom_token'),
  setToken: (t) => localStorage.setItem('phantom_token', t),
  getUser: () => {
    try { return JSON.parse(localStorage.getItem('phantom_user')); } catch { return null; }
  },
  setUser: (u) => localStorage.setItem('phantom_user', JSON.stringify(u)),
  clear: () => { localStorage.removeItem('phantom_token'); localStorage.removeItem('phantom_user'); },
  isLoggedIn: () => !!localStorage.getItem('phantom_token'),
  isAdmin: () => {
    try { return JSON.parse(localStorage.getItem('phantom_user'))?.role === 'admin'; } catch { return false; }
  }
};

// ─── API FETCH ─────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${endpoint}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    Auth.clear();
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login?expired=1';
    }
    throw new Error(data.error || 'Non autorisé');
  }

  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

// ─── TOAST NOTIFICATIONS ───────────────────────
function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-msg">${message}</span>
    <button onclick="this.parentElement.remove()" style="background:none;color:var(--text-muted);font-size:1.1rem;padding:0 4px;margin-left:8px;">×</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, duration);

  return toast;
}

// ─── MODAL ─────────────────────────────────────
function showModal({ title, body, footer, onClose, size }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay' + (size === 'lg' ? ' modal-lg' : '');
  overlay.innerHTML = `
    <div class="modal animate-slide-up">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="btn btn-icon btn-ghost close-modal-btn" aria-label="Fermer">✕</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;

  overlay.querySelector('.close-modal-btn').onclick = () => closeModal(overlay, onClose);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay, onClose); });
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  return overlay;
}

function closeModal(overlay, onClose) {
  if (onClose) onClose();
  overlay.remove();
  document.body.style.overflow = '';
}

// ─── CONFIRM DIALOG ────────────────────────────
function confirmDialog(message, onConfirm, options = {}) {
  const { title = 'Confirmation', danger = false } = options;
  const overlay = showModal({
    title,
    body: `<p style="color:var(--text-secondary)">${message}</p>`,
    footer: `
      <button class="btn btn-ghost" id="cancelBtn">Annuler</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirmBtn">Confirmer</button>
    `
  });
  overlay.querySelector('#cancelBtn').onclick = () => closeModal(overlay);
  overlay.querySelector('#confirmBtn').onclick = () => { closeModal(overlay); onConfirm(); };
}

// ─── FORMAT HELPERS ────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'À l\'instant';
  if (m < 60) return `Il y a ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `Il y a ${d}j`;
}

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

// ─── IMAGE FALLBACK ────────────────────────────
function imgFallback(img, fallback = '📺') {
  img.onerror = () => {
    img.style.display = 'none';
    const span = document.createElement('span');
    span.textContent = fallback;
    span.style.cssText = 'font-size:1.5rem;display:flex;align-items:center;justify-content:center;width:100%;height:100%';
    img.parentNode.appendChild(span);
  };
}

// ─── GUARD AUTH ────────────────────────────────
function requireAuth() {
  if (!Auth.isLoggedIn()) {
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
    return false;
  }
  return true;
}

function requireAdminAuth() {
  if (!Auth.isLoggedIn() || !Auth.isAdmin()) {
    window.location.href = Auth.isLoggedIn() ? '/dashboard' : '/login';
    return false;
  }
  return true;
}

// ─── COPY TO CLIPBOARD ─────────────────────────
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copié dans le presse-papiers', 'success', 2000);
  } catch {
    showToast('Impossible de copier', 'error');
  }
}
