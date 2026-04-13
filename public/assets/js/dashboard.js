/* ═══════════════════════════════════════════════
   PHANTOM TV — Dashboard JS
   ═══════════════════════════════════════════════ */

if (!requireAuth()) throw new Error('Auth required');

// ─── STATE ────────────────────────────────────
let state = {
  view: 'all',        // all | favorites | history | category
  category: null,
  search: '',
  page: 1,
  limit: 48,
  sort: 'name',
  quality: '',
  listView: false,
  totalPages: 1,
};

// ─── DOM REFS ─────────────────────────────────
const channelsGrid = document.getElementById('channelsGrid');
const featuredGrid = document.getElementById('featuredGrid');
const viewTitle = document.getElementById('viewTitle');
const viewCount = document.getElementById('viewCount');
const pagination = document.getElementById('pagination');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const sortSelect = document.getElementById('sortSelect');
const qualityFilter = document.getElementById('qualityFilter');
const tickerContent = document.getElementById('tickerContent');
const featuredSection = document.getElementById('featuredSection');
const channelsSectionTitle = document.getElementById('channelsSectionTitle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

// ─── INIT ─────────────────────────────────────
async function init() {
  loadUserProfile();
  loadCategories();
  loadFeatured();
  loadChannels();
  loadEpgTicker();

  if (Auth.isAdmin()) {
    document.getElementById('adminLink').classList.remove('hidden');
  }

  // Refresh EPG every 5 minutes
  setInterval(loadEpgTicker, 5 * 60000);
}

// ─── USER PROFILE ─────────────────────────────
async function loadUserProfile() {
  try {
    const user = await apiFetch('/auth/me');
    Auth.setUser(user);

    document.getElementById('userAvatar').textContent = user.username[0].toUpperCase();
    document.getElementById('userName').textContent = user.username;

    const planLabels = { free: '🆓 Free', premium: '⭐ Premium', ultimate: '👑 Ultimate', admin: '🛡️ Admin' };
    document.getElementById('userPlan').textContent = planLabels[user.subscription_plan] || user.subscription_plan;

    if (user.role === 'admin') document.getElementById('adminLink').classList.remove('hidden');
  } catch (err) {
    console.error('Profile load error:', err);
  }
}

// ─── CATEGORIES ───────────────────────────────
async function loadCategories() {
  try {
    const cats = await apiFetch('/channels/categories');
    const list = document.getElementById('categoriesList');

    list.innerHTML = cats.map(c => `
      <a href="#" class="sidebar-link" data-view="category" data-cat="${c.slug}" data-cat-id="${c.id}">
        <span class="link-icon">${c.icon}</span>
        ${c.name}
        ${c.channel_count > 0 ? `<span class="link-count">${c.channel_count}</span>` : ''}
      </a>
    `).join('');

    list.querySelectorAll('.sidebar-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.dataset.view;
        const cat = link.dataset.cat;
        setView(view, cat);
        setActiveSidebarLink(link);
      });
    });
  } catch (err) {
    console.error('Categories error:', err);
  }
}

// ─── FEATURED CHANNELS ────────────────────────
async function loadFeatured() {
  try {
    const data = await apiFetch('/channels?featured=1&limit=6');
    if (!data.channels.length) { featuredSection.style.display = 'none'; return; }

    const now = new Date().toISOString();
    featuredGrid.innerHTML = data.channels.map(ch => `
      <div class="featured-card" onclick="goWatch(${ch.id})">
        <div class="featured-bg"></div>
        <div class="featured-overlay"></div>
        <div class="featured-logo">
          ${ch.logo ? `<img src="${ch.logo}" alt="${ch.name}" onerror="this.parentElement.innerHTML='📺'">` : '📺'}
        </div>
        <div class="featured-badge">
          <span class="badge badge-danger" style="font-size:0.65rem">⬤ LIVE</span>
        </div>
        <div class="featured-info">
          <div class="featured-name">${ch.name}</div>
          <div class="featured-now">${ch.category_icon || ''} ${ch.category_name || ''} · ${ch.quality}</div>
        </div>
        <button class="featured-fav ${ch.is_favorite ? 'active' : ''}"
          onclick="event.stopPropagation();toggleFavorite(${ch.id},this)"
          title="${ch.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
          ${ch.is_favorite ? '⭐' : '☆'}
        </button>
      </div>
    `).join('');
  } catch (err) {
    featuredSection.style.display = 'none';
  }
}

// ─── CHANNELS ─────────────────────────────────
async function loadChannels() {
  showSkeletons();
  emptyState.classList.add('hidden');

  try {
    let endpoint = '';
    let params = new URLSearchParams({
      page: state.page,
      limit: state.limit,
      sort: state.sort,
    });

    if (state.quality) params.set('quality', state.quality);

    if (state.view === 'favorites') {
      const favs = await apiFetch('/channels/favorites');
      renderChannels(favs, favs.length);
      viewTitle.textContent = '⭐ Mes Favoris';
      viewCount.textContent = `${favs.length} chaîne${favs.length !== 1 ? 's' : ''}`;
      pagination.innerHTML = '';
      return;
    }

    if (state.view === 'history') {
      const history = await apiFetch('/channels/history');
      renderChannels(history, history.length);
      viewTitle.textContent = '🕒 Historique';
      viewCount.textContent = `${history.length} récemment vues`;
      pagination.innerHTML = '';
      return;
    }

    if (state.category) params.set('category', state.category);
    if (state.search) params.set('search', state.search);

    const data = await apiFetch(`/channels?${params}`);
    state.totalPages = data.pagination.pages;

    renderChannels(data.channels, data.pagination.total);
    renderPagination(data.pagination);

    if (!state.category && !state.search) {
      viewTitle.textContent = '🌐 Toutes les chaînes';
      channelsSectionTitle.textContent = 'Catalogue complet';
    }
  } catch (err) {
    console.error('Channels load error:', err);
    showToast('Erreur lors du chargement des chaînes', 'error');
  }
}

function renderChannels(channels, total) {
  if (!channels.length) {
    channelsGrid.innerHTML = '';
    emptyState.classList.remove('hidden');
    viewCount.textContent = '0 chaîne';
    return;
  }

  viewCount.textContent = `${formatNumber(total)} chaîne${total !== 1 ? 's' : ''}`;
  emptyState.classList.add('hidden');

  channelsGrid.innerHTML = channels.map(ch => createChannelCard(ch)).join('');

  // Set up interactions
  channelsGrid.querySelectorAll('.channel-card').forEach(card => {
    const id = card.dataset.id;
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.channel-fav-btn')) goWatch(id);
    });
    const favBtn = card.querySelector('.channel-fav-btn');
    if (favBtn) favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(id, favBtn);
    });
  });
}

function createChannelCard(ch) {
  return `
    <div class="channel-card" data-id="${ch.id}">
      <div class="channel-thumb">
        ${ch.logo
          ? `<img class="channel-logo" src="${ch.logo}" alt="${ch.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">`
          : ''}
        <span class="channel-logo-fallback" ${ch.logo ? 'style="display:none"' : ''}>📺</span>
        <div class="channel-play-overlay">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="var(--accent)"><path d="M5 3l14 9-14 9V3z"/></svg>
        </div>
        <button class="channel-fav-btn ${ch.is_favorite ? 'active' : ''}" title="${ch.is_favorite ? 'Retirer' : 'Favoris'}">
          ${ch.is_favorite ? '⭐' : '☆'}
        </button>
      </div>
      <div class="channel-info">
        <div class="channel-name" title="${ch.name}">${ch.name}</div>
        <div class="channel-meta">
          <span class="channel-cat">${ch.category_icon || ''} ${ch.category_name || 'Autre'}</span>
          <span class="channel-quality">${ch.quality || 'HD'}</span>
        </div>
        <div class="channel-views">👁 ${formatNumber(ch.views || 0)}</div>
      </div>
    </div>
  `;
}

function showSkeletons() {
  channelsGrid.innerHTML = Array(12).fill(0).map(() => `
    <div class="channel-skeleton">
      <div class="skeleton ch-skel-thumb"></div>
      <div class="ch-skel-info">
        <div class="skeleton ch-skel-name"></div>
        <div class="skeleton ch-skel-meta"></div>
      </div>
    </div>
  `).join('');
}

// ─── PAGINATION ───────────────────────────────
function renderPagination({ page, pages }) {
  if (pages <= 1) { pagination.innerHTML = ''; return; }

  const btns = [];
  btns.push(`<button class="page-btn" ${page <= 1 ? 'disabled' : ''} onclick="goPage(${page - 1})">←</button>`);

  const range = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) range.push(i);
  if (range[0] > 1) { btns.push(`<button class="page-btn" onclick="goPage(1)">1</button>`); if (range[0] > 2) btns.push(`<span style="color:var(--text-muted);padding:0 4px">…</span>`); }
  range.forEach(p => btns.push(`<button class="page-btn ${p === page ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`));
  if (range[range.length - 1] < pages) { if (range[range.length - 1] < pages - 1) btns.push(`<span style="color:var(--text-muted);padding:0 4px">…</span>`); btns.push(`<button class="page-btn" onclick="goPage(${pages})">${pages}</button>`); }

  btns.push(`<button class="page-btn" ${page >= pages ? 'disabled' : ''} onclick="goPage(${page + 1})">→</button>`);
  pagination.innerHTML = btns.join('');
}

function goPage(p) {
  state.page = p;
  loadChannels();
  window.scrollTo(0, 0);
}

// ─── EPG TICKER ───────────────────────────────
async function loadEpgTicker() {
  try {
    const programs = await apiFetch('/epg/now');
    if (!programs.length) { tickerContent.textContent = 'Aucun programme en cours'; return; }

    tickerContent.innerHTML = programs.map(p => `
      <span style="margin-right:40px">
        <strong style="color:var(--text-primary)">${p.channel_name}</strong>
        — ${p.title}
        <span style="color:var(--accent-bright)">[${formatTime(p.start_time)}–${formatTime(p.end_time)}]</span>
      </span>
    `).join('');
  } catch {}
}

// ─── FAVORITES ────────────────────────────────
async function toggleFavorite(channelId, btn) {
  const isFav = btn.classList.contains('active');
  try {
    if (isFav) {
      await apiFetch(`/channels/${channelId}/favorite`, { method: 'DELETE' });
      btn.classList.remove('active');
      btn.textContent = '☆';
      showToast('Retiré des favoris', 'info', 2000);
    } else {
      await apiFetch(`/channels/${channelId}/favorite`, { method: 'POST' });
      btn.classList.add('active');
      btn.textContent = '⭐';
      showToast('Ajouté aux favoris !', 'success', 2000);
    }
    // Also update featured section
    const featFav = featuredGrid.querySelector(`[onclick*="${channelId}"] .featured-fav`);
    if (featFav) { featFav.classList.toggle('active', !isFav); featFav.textContent = !isFav ? '⭐' : '☆'; }
  } catch (err) { showToast(err.message, 'error'); }
}

// ─── NAVIGATION ───────────────────────────────
function setView(view, category = null) {
  state.view = view;
  state.category = category;
  state.page = 1;
  state.search = '';
  searchInput.value = '';
  searchResults.classList.remove('show');

  featuredSection.style.display = (view === 'all' && !category) ? '' : 'none';

  if (view === 'category' && category) {
    const link = document.querySelector(`[data-cat="${category}"]`);
    if (link) viewTitle.textContent = link.textContent.trim();
  }

  loadChannels();
}

function setActiveSidebarLink(el) {
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  el.classList.add('active');
}

function goWatch(channelId) {
  window.location.href = `/watch/${channelId}`;
}

// ─── SEARCH ───────────────────────────────────
const doSearch = debounce(async (q) => {
  if (!q || q.length < 2) { searchResults.classList.remove('show'); return; }

  try {
    const results = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then(r => r.json());

    if (!results.length) {
      searchResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.85rem">Aucun résultat</div>';
      searchResults.classList.add('show');
      return;
    }

    searchResults.innerHTML = results.map(ch => `
      <div class="search-result-item" onclick="goWatch(${ch.id})">
        <div class="search-result-logo">
          ${ch.logo ? `<img src="${ch.logo}" alt="${ch.name}" onerror="this.style.display='none'">` : '<span>📺</span>'}
        </div>
        <div class="search-result-info">
          <div class="search-result-name">${ch.name}</div>
          <div class="search-result-cat">${ch.category_icon || ''} ${ch.category_name || ''}</div>
        </div>
        <span class="search-result-quality">${ch.quality || 'HD'}</span>
      </div>
    `).join('');
    searchResults.classList.add('show');
  } catch {}
}, 300);

searchInput.addEventListener('input', (e) => doSearch(e.target.value));
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) searchResults.classList.remove('show');
});

// ─── FILTERS ──────────────────────────────────
sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; state.page = 1; loadChannels(); });
qualityFilter.addEventListener('change', () => { state.quality = qualityFilter.value; state.page = 1; loadChannels(); });

document.querySelectorAll('.quality-badge').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.quality-badge').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.quality = btn.dataset.quality;
    state.page = 1;
    loadChannels();
  });
});

// ─── VIEW TOGGLE ──────────────────────────────
document.getElementById('viewToggleBtn').addEventListener('click', () => {
  state.listView = !state.listView;
  channelsGrid.classList.toggle('list-view', state.listView);
  document.getElementById('viewToggleBtn').textContent = state.listView ? '⊟' : '⊞';
});

// ─── SIDEBAR MOBILE ───────────────────────────
document.getElementById('sidebarToggle').addEventListener('click', () => {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('show');
});
document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('show');
}

// ─── SIDEBAR LINKS ────────────────────────────
document.querySelectorAll('.sidebar-link[data-view]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    setView(link.dataset.view);
    setActiveSidebarLink(link);
    if (window.innerWidth < 900) closeSidebar();
  });
});

// ─── LOGOUT ───────────────────────────────────
async function doLogout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch {}
  Auth.clear();
  window.location.href = '/';
}

// ─── PROFILE MODAL ────────────────────────────
function showProfileModal() {
  const user = Auth.getUser();
  showModal({
    title: '⚙ Mon Profil',
    body: `
      <div style="display:flex;flex-direction:column;gap:20px">
        <div style="display:flex;align-items:center;gap:16px">
          <div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#5a52d5);display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;color:#fff">
            ${user?.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <div style="font-weight:700;font-size:1.1rem">${user?.username}</div>
            <div style="color:var(--text-muted);font-size:0.85rem">${user?.email}</div>
            <div style="color:var(--accent-bright);font-size:0.78rem;margin-top:4px">${user?.subscription_plan?.toUpperCase() || 'FREE'}</div>
          </div>
        </div>
        <form id="profileForm" style="display:flex;flex-direction:column;gap:16px">
          <div class="form-group">
            <label class="form-label">Nouvel Email</label>
            <input type="email" class="form-control" id="profileEmail" placeholder="${user?.email || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Mot de passe actuel</label>
            <input type="password" class="form-control" id="profileCurPw" placeholder="Requis pour changer le mot de passe">
          </div>
          <div class="form-group">
            <label class="form-label">Nouveau mot de passe</label>
            <input type="password" class="form-control" id="profileNewPw" placeholder="Laisser vide pour ne pas changer">
          </div>
        </form>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove();document.body.style.overflow=''">Annuler</button>
      <button class="btn btn-primary" onclick="saveProfile()">Sauvegarder</button>
    `
  });
}

async function saveProfile() {
  const payload = {};
  const email = document.getElementById('profileEmail')?.value?.trim();
  const curPw = document.getElementById('profileCurPw')?.value;
  const newPw = document.getElementById('profileNewPw')?.value;

  if (email) payload.email = email;
  if (newPw) { payload.currentPassword = curPw; payload.newPassword = newPw; }

  try {
    const updated = await apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify(payload) });
    Auth.setUser({ ...Auth.getUser(), ...updated });
    showToast('Profil mis à jour !', 'success');
    document.querySelector('.modal-overlay')?.remove();
    document.body.style.overflow = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── START ────────────────────────────────────
init();
