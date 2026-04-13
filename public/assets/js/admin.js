/* ═══════════════════════════════════════════════
   PHANTOM TV — Admin Panel JS
   ═══════════════════════════════════════════════ */

if (!requireAdminAuth()) throw new Error('Admin required');

// ─── STATE ────────────────────────────────────
const adminState = {
  channels:  { page: 1, search: '', category: '' },
  users:     { page: 1, search: '', role: '' },
  accounts:  { page: 1, search: '', status: '', plan: '' },
};

let allCategories = [];

// ─── INIT ─────────────────────────────────────
async function init() {
  const user = Auth.getUser();
  if (user) {
    document.getElementById('adminUserAv').textContent = user.username[0].toUpperCase();
    document.getElementById('adminUserName').textContent = user.username;
  }

  // Nav links
  document.querySelectorAll('.admin-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchSection(link.dataset.section);
    });
  });

  await loadCategories();
  loadDashboard();
  initImport();
}

// ─── SECTIONS ─────────────────────────────────
function switchSection(name) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-link').forEach(l => l.classList.remove('active'));

  document.getElementById(`section-${name}`).classList.add('active');
  document.querySelector(`[data-section="${name}"]`).classList.add('active');

  const titles = {
    dashboard: 'Dashboard', channels: 'Chaînes', users: 'Utilisateurs',
    accounts: 'Gestion des Comptes', categories: 'Catégories', import: 'Import M3U'
  };
  document.getElementById('pageTitle').textContent = titles[name] || name;
  document.getElementById('pageBreadcrumb').textContent = `Admin / ${titles[name] || name}`;

  // Load section content
  switch (name) {
    case 'accounts':    loadAccounts(); break;
    case 'channels':    loadChannels(); break;
    case 'users':       loadUsers(); break;
    case 'categories':  loadCategoriesAdmin(); break;
  }
}

// ─── DASHBOARD ────────────────────────────────
async function loadDashboard() {
  try {
    const stats = await apiFetch('/admin/stats');
    renderStats(stats);
    renderTopChannels(stats.top_channels);
    renderRecentUsers(stats.recent_users);
    renderCatStats(stats.categories_stats);
  } catch (err) {
    showToast('Erreur chargement dashboard: ' + err.message, 'error');
  }
}

function renderStats(stats) {
  const grid = document.getElementById('statsGrid');
  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-card-icon">📺</div>
      <div class="stat-card-value">${formatNumber(stats.channels)}</div>
      <div class="stat-card-label">Chaînes totales</div>
      <div class="stat-card-delta up">▲ ${stats.active_channels} actives</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-icon">👥</div>
      <div class="stat-card-value">${formatNumber(stats.users)}</div>
      <div class="stat-card-label">Utilisateurs</div>
      <div class="stat-card-delta up">▲ ${stats.active_users} actifs</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-icon">👁</div>
      <div class="stat-card-value">${formatNumber(stats.views_today)}</div>
      <div class="stat-card-label">Vues aujourd'hui</div>
      <div class="stat-card-delta">Total: ${formatNumber(stats.views_total)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-icon">⭐</div>
      <div class="stat-card-value">${formatNumber(stats.favorites)}</div>
      <div class="stat-card-label">Favoris totaux</div>
    </div>
  `;
}

function renderTopChannels(channels) {
  document.getElementById('topChannels').innerHTML = channels.map((ch, i) => `
    <div class="top-channel-item">
      <div class="tc-rank">${['🥇','🥈','🥉','4','5'][i] || i + 1}</div>
      <div class="tc-logo">
        ${ch.logo ? `<img src="${ch.logo}" alt="${ch.name}" onerror="this.style.display='none'">` : '📺'}
      </div>
      <div class="tc-name">${ch.name}</div>
      <div class="tc-views">👁 ${formatNumber(ch.views)}</div>
    </div>
  `).join('') || '<div style="color:var(--text-muted);font-size:0.85rem;padding:16px">Aucune donnée</div>';
}

function renderRecentUsers(users) {
  document.getElementById('recentUsers').innerHTML = users.map(u => `
    <div class="recent-user-item">
      <div class="ru-av">${u.username[0].toUpperCase()}</div>
      <div class="ru-name">${u.username}</div>
      <span class="badge ${u.subscription_plan === 'premium' ? 'badge-gold' : 'badge-accent'}" style="font-size:0.7rem">${u.subscription_plan}</span>
      <div class="ru-date">${formatDate(u.created_at)}</div>
    </div>
  `).join('') || '<div style="color:var(--text-muted);font-size:0.85rem;padding:16px">Aucun utilisateur</div>';
}

function renderCatStats(cats) {
  const max = Math.max(...cats.map(c => c.count), 1);
  document.getElementById('catStats').innerHTML = cats.slice(0, 6).map(c => `
    <div class="cat-bar-item">
      <div class="cat-bar-info">
        <span>${c.icon} ${c.name}</span>
        <span style="color:var(--text-muted)">${c.count} chaînes</span>
      </div>
      <div class="cat-bar-track">
        <div class="cat-bar-fill" style="width:${(c.count / max * 100).toFixed(1)}%"></div>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════════
// ─── ACCOUNTS ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

async function loadAccounts() {
  await loadAccountStats();
  await refreshAccountsTable();
}

async function loadAccountStats() {
  try {
    const s = await apiFetch('/admin/accounts/stats');
    const bar = document.getElementById('accStatsBar');
    bar.innerHTML = `
      <div class="acc-stat-pill acc-stat-total">
        <div class="acc-stat-val">${s.total}</div>
        <div class="acc-stat-lbl">Total comptes</div>
      </div>
      <div class="acc-stat-pill acc-stat-active">
        <div class="acc-stat-val">${s.active}</div>
        <div class="acc-stat-lbl">Actifs</div>
      </div>
      <div class="acc-stat-pill acc-stat-warning">
        <div class="acc-stat-val">${s.expiring_soon}</div>
        <div class="acc-stat-lbl">Expire &lt; 7j</div>
      </div>
      <div class="acc-stat-pill acc-stat-danger">
        <div class="acc-stat-val">${s.expired}</div>
        <div class="acc-stat-lbl">Expirés</div>
      </div>
      <div class="acc-stat-pill acc-stat-unlimited">
        <div class="acc-stat-val">${s.unlimited}</div>
        <div class="acc-stat-lbl">Illimités</div>
      </div>
    `;
  } catch {}
}

async function refreshAccountsTable() {
  const { page, search, status, plan } = adminState.accounts;
  const params = new URLSearchParams({ page, limit: 20, search });
  if (plan) params.set('plan', plan);

  try {
    const data = await apiFetch(`/admin/users?${params}&role=user`);
    const now = new Date();
    const soon = new Date(); soon.setDate(soon.getDate() + 7);

    // Filtrage côté client du statut (plus rapide que l'aller-retour serveur)
    let users = data.users.filter(u => u.role !== 'admin');
    if (status === 'active')    users = users.filter(u => u.is_active && (!u.subscription_end || new Date(u.subscription_end) > soon));
    if (status === 'expiring')  users = users.filter(u => u.subscription_end && new Date(u.subscription_end) > now && new Date(u.subscription_end) <= soon);
    if (status === 'expired')   users = users.filter(u => u.subscription_end && new Date(u.subscription_end) <= now);
    if (status === 'unlimited') users = users.filter(u => !u.subscription_end && u.subscription_plan !== 'free');

    renderAccountsTable(users, now, soon);
    renderTablePagination('accountsPagination', data.total, page, 20, (p) => {
      adminState.accounts.page = p; refreshAccountsTable();
    });
  } catch (err) {
    showToast('Erreur chargement comptes: ' + err.message, 'error');
  }
}

function getSubStatus(user, now, soon) {
  if (!user.subscription_end) {
    return user.subscription_plan === 'free'
      ? { cls: 'sub-free',      icon: '○', label: 'Free' }
      : { cls: 'sub-unlimited', icon: '∞', label: 'Illimité' };
  }
  const exp = new Date(user.subscription_end);
  if (exp <= now)   return { cls: 'sub-expired',  icon: '✕', label: 'Expiré' };
  if (exp <= soon)  return { cls: 'sub-expiring', icon: '⚠', label: 'Expire bientôt' };
  return { cls: 'sub-active', icon: '✓', label: 'Actif' };
}

function formatExpiry(dateStr, now) {
  if (!dateStr) return '<span style="color:var(--text-muted)">—</span>';
  const d = new Date(dateStr);
  const diff = Math.ceil((d - now) / 86400000);
  const dateLabel = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
  if (diff < 0)  return `<span class="expiry-label expiry-expired">${dateLabel}</span>`;
  if (diff <= 7) return `<span class="expiry-label expiry-warning">${dateLabel} <em>(J-${diff})</em></span>`;
  return `<span class="expiry-label expiry-ok">${dateLabel} <em>(J-${diff})</em></span>`;
}

const PLAN_LABELS = { free: 'badge-muted', premium: 'badge-gold', ultimate: 'badge-cyan', vip: 'badge-accent' };

function renderAccountsTable(users, now, soon) {
  const tbody = document.getElementById('accountsTbody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Aucun compte trouvé</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => {
    const sub = getSubStatus(u, now, soon);
    return `
    <tr class="${sub.cls === 'sub-expired' ? 'row-expired' : ''}">
      <td>
        <div class="user-name-cell">
          <div class="user-av-sm acc-av-${(u.username.charCodeAt(0) % 6) + 1}">${u.username[0].toUpperCase()}</div>
          <div>
            <div style="font-weight:700">${u.username}</div>
            <div style="font-size:0.72rem;color:var(--text-muted)">${u.email}</div>
          </div>
        </div>
      </td>
      <td>
        <span class="badge ${PLAN_LABELS[u.subscription_plan] || 'badge-accent'}">${u.subscription_plan.toUpperCase()}</span>
      </td>
      <td>${formatExpiry(u.subscription_end, now)}</td>
      <td>
        <span class="streams-badge">
          <span class="streams-icon">▶</span> ${u.max_streams || 1}
        </span>
      </td>
      <td>
        <span class="sub-status-badge ${sub.cls}">
          <span class="sub-icon">${sub.icon}</span> ${sub.label}
        </span>
      </td>
      <td style="font-size:0.82rem;color:var(--text-muted)">${formatDate(u.created_at)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-icon-sm btn-primary" onclick="showExtendModal(${u.id},'${u.username}','${u.subscription_end || ''}')" title="Prolonger">＋</button>
          <button class="btn btn-icon-sm btn-ghost" onclick="showUserModal(${JSON.stringify(u).replace(/"/g,'&quot;')})" title="Modifier">✏️</button>
          <button class="btn btn-icon-sm ${u.is_active ? 'btn-warning' : 'btn-success'}"
            onclick="toggleUserStatus(${u.id},${u.is_active},'${u.username}')"
            title="${u.is_active ? 'Suspendre' : 'Activer'}"
            style="${u.is_active ? 'background:var(--warning);color:#000' : 'background:var(--success);color:#000'}">
            ${u.is_active ? '⏸' : '▶'}
          </button>
          <button class="btn btn-icon-sm btn-danger" onclick="deleteUser(${u.id},'${u.username}')" title="Supprimer">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── FILTRES COMPTES ──────────────────────────────
const accSearchInput = document.getElementById('accSearch');
if (accSearchInput) {
  accSearchInput.addEventListener('input', debounce((e) => {
    adminState.accounts.search = e.target.value;
    adminState.accounts.page = 1;
    refreshAccountsTable();
  }, 400));
}
const accStatusFilter = document.getElementById('accStatusFilter');
if (accStatusFilter) {
  accStatusFilter.addEventListener('change', () => {
    adminState.accounts.status = accStatusFilter.value;
    adminState.accounts.page = 1;
    refreshAccountsTable();
  });
}
const accPlanFilter = document.getElementById('accPlanFilter');
if (accPlanFilter) {
  accPlanFilter.addEventListener('change', () => {
    adminState.accounts.plan = accPlanFilter.value;
    adminState.accounts.page = 1;
    refreshAccountsTable();
  });
}

// ─── MODAL CRÉER UN COMPTE ────────────────────────
function showCreateAccountModal() {
  showModal({
    title: '＋ Créer un compte',
    size: 'lg',
    body: `
      <div class="create-acc-form">

        <div class="create-acc-section-title">Identifiants</div>
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">Nom d'utilisateur *</label>
            <input class="form-control" id="caUsername" placeholder="ex: john_doe" autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-label">Email *</label>
            <input class="form-control" id="caEmail" type="email" placeholder="ex: john@mail.com" autocomplete="off">
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">Mot de passe *</label>
            <div class="input-with-btn">
              <input class="form-control" id="caPassword" type="text" placeholder="Mot de passe" autocomplete="off">
              <button type="button" class="btn btn-ghost btn-sm" onclick="generatePassword()" title="Générer">🎲</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Rôle</label>
            <select class="form-control" id="caRole">
              <option value="user" selected>Utilisateur</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>
        </div>

        <div class="create-acc-section-title" style="margin-top:20px">Abonnement</div>
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">Plan</label>
            <select class="form-control" id="caPlan">
              <option value="free">Free</option>
              <option value="premium" selected>Premium</option>
              <option value="ultimate">Ultimate</option>
              <option value="vip">VIP</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Durée d'abonnement</label>
            <select class="form-control" id="caDuration">
              <option value="1">1 mois</option>
              <option value="3">3 mois</option>
              <option value="6">6 mois</option>
              <option value="12" selected>12 mois</option>
              <option value="unlimited">Illimité</option>
            </select>
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">Streams simultanés max</label>
            <select class="form-control" id="caStreams">
              <option value="1" selected>1 stream</option>
              <option value="2">2 streams</option>
              <option value="3">3 streams</option>
              <option value="5">5 streams</option>
              <option value="99">Illimité</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Expiration estimée</label>
            <div class="expiry-preview" id="expiryPreview">—</div>
          </div>
        </div>

        <div class="pass-copy-hint" id="passCopyHint"></div>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove();document.body.style.overflow=''">Annuler</button>
      <button class="btn btn-primary" id="createAccBtn" onclick="submitCreateAccount()">Créer le compte</button>
    `
  });

  // Mettre à jour l'aperçu d'expiration au changement de durée
  const durationSel = document.getElementById('caDuration');
  if (durationSel) {
    durationSel.addEventListener('change', updateExpiryPreview);
    updateExpiryPreview();
  }
}

function updateExpiryPreview() {
  const val = document.getElementById('caDuration')?.value;
  const el  = document.getElementById('expiryPreview');
  if (!el) return;
  if (!val || val === 'unlimited') {
    el.textContent = '♾ Pas d\'expiration';
    el.className = 'expiry-preview expiry-unlimited';
    return;
  }
  const d = new Date();
  d.setMonth(d.getMonth() + parseInt(val));
  el.textContent = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
  el.className = 'expiry-preview expiry-date';
}

function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789@#!';
  let pwd = '';
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  const input = document.getElementById('caPassword');
  if (input) {
    input.value = pwd;
    input.select();
    try { document.execCommand('copy'); } catch {}
    const hint = document.getElementById('passCopyHint');
    if (hint) { hint.textContent = `Mot de passe copié : ${pwd}`; hint.style.opacity = '1'; setTimeout(() => hint.style.opacity = '0', 3000); }
  }
}

async function submitCreateAccount() {
  const username  = document.getElementById('caUsername')?.value.trim();
  const email     = document.getElementById('caEmail')?.value.trim();
  const password  = document.getElementById('caPassword')?.value.trim();
  const role      = document.getElementById('caRole')?.value;
  const plan      = document.getElementById('caPlan')?.value;
  const duration  = document.getElementById('caDuration')?.value;
  const streams   = document.getElementById('caStreams')?.value;

  if (!username || !email || !password) {
    showToast('Nom, email et mot de passe requis', 'error');
    return;
  }

  const btn = document.getElementById('createAccBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Création...'; }

  try {
    await apiFetch('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username, email, password, role,
        subscription_plan: plan,
        subscription_duration: duration,
        max_streams: parseInt(streams) || 1,
      })
    });

    document.querySelector('.modal-overlay')?.remove();
    document.body.style.overflow = '';
    showToast(`✅ Compte "${username}" créé !`, 'success');
    loadAccounts();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Créer le compte'; }
  }
}

// ─── MODAL PROLONGER ─────────────────────────────
function showExtendModal(userId, username, currentEnd) {
  const hasEnd = currentEnd && currentEnd !== '';
  const currentLabel = hasEnd
    ? `Expiration actuelle : <strong>${new Date(currentEnd).toLocaleDateString('fr-FR', {day:'2-digit',month:'long',year:'numeric'})}</strong>`
    : 'Abonnement illimité ou expiré';

  showModal({
    title: `Prolonger l'abonnement — ${username}`,
    body: `
      <div style="display:flex;flex-direction:column;gap:20px">
        <div class="extend-current-info">${currentLabel}</div>
        <div class="form-group">
          <label class="form-label">Ajouter</label>
          <div class="extend-duration-grid">
            ${[['1','+ 1 mois'],['3','+ 3 mois'],['6','+ 6 mois'],['12','+ 12 mois']].map(([v,l]) => `
              <label class="extend-option">
                <input type="radio" name="extDuration" value="${v}" ${v==='1'?'checked':''}>
                <span class="extend-option-label">${l}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div id="extendPreview" class="extend-preview"></div>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove();document.body.style.overflow=''">Annuler</button>
      <button class="btn btn-primary" onclick="submitExtend(${userId},'${currentEnd}')">Prolonger</button>
    `
  });

  // Aperçu
  function updateExtendPreview() {
    const months = parseInt(document.querySelector('input[name="extDuration"]:checked')?.value || '1');
    const base = hasEnd && new Date(currentEnd) > new Date() ? new Date(currentEnd) : new Date();
    const newEnd = new Date(base);
    newEnd.setMonth(newEnd.getMonth() + months);
    const el = document.getElementById('extendPreview');
    if (el) el.innerHTML = `Nouvelle expiration : <strong>${newEnd.toLocaleDateString('fr-FR', {day:'2-digit',month:'long',year:'numeric'})}</strong>`;
  }
  document.querySelectorAll('input[name="extDuration"]').forEach(r => r.addEventListener('change', updateExtendPreview));
  updateExtendPreview();
}

async function submitExtend(userId, currentEnd) {
  const months = parseInt(document.querySelector('input[name="extDuration"]:checked')?.value);
  if (!months) return;
  try {
    const res = await apiFetch(`/admin/users/${userId}/extend`, {
      method: 'PUT',
      body: JSON.stringify({ months })
    });
    const newDate = new Date(res.subscription_end).toLocaleDateString('fr-FR', {day:'2-digit',month:'long',year:'numeric'});
    document.querySelector('.modal-overlay')?.remove();
    document.body.style.overflow = '';
    showToast(`Abonnement prolongé jusqu'au ${newDate}`, 'success');
    loadAccounts();
  } catch (err) { showToast(err.message, 'error'); }
}

// ─── CHANNELS ─────────────────────────────────
async function loadChannels() {
  const { page, search, category } = adminState.channels;
  const params = new URLSearchParams({ page, limit: 20, search, category });

  try {
    const data = await apiFetch(`/admin/channels?${params}`);
    renderChannelsTable(data.channels);
    renderTablePagination('channelsPagination', data.total, page, 20, (p) => {
      adminState.channels.page = p; loadChannels();
    });
  } catch (err) {
    showToast('Erreur: ' + err.message, 'error');
  }
}

function renderChannelsTable(channels) {
  const tbody = document.getElementById('channelsTbody');
  if (!channels.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Aucune chaîne trouvée</td></tr>';
    return;
  }

  tbody.innerHTML = channels.map(ch => `
    <tr>
      <td>
        <div class="channel-name-cell">
          <div class="ch-logo-sm">
            ${ch.logo ? `<img src="${ch.logo}" alt="${ch.name}" onerror="this.style.display='none'">` : '📺'}
          </div>
          <div>
            <div style="font-weight:600">${ch.name}</div>
            <div style="font-size:0.72rem;color:var(--text-muted)">${ch.group_title || '—'}</div>
          </div>
        </div>
      </td>
      <td><span style="color:var(--text-secondary)">${ch.category_name || '—'}</span></td>
      <td><span class="badge badge-accent">${ch.quality || 'HD'}</span></td>
      <td>${ch.country || '—'}</td>
      <td>${formatNumber(ch.views)}</td>
      <td>
        <span class="status-dot ${ch.is_active ? 'status-active' : 'status-inactive'}"></span>
        ${ch.is_active ? 'Actif' : 'Inactif'}
      </td>
      <td>
        <div class="action-btns">
          <a href="/watch/${ch.id}" target="_blank" class="btn btn-icon-sm btn-ghost" title="Voir">▶</a>
          <button class="btn btn-icon-sm btn-ghost" onclick="showChannelModal(${JSON.stringify(ch).replace(/"/g, '&quot;')})" title="Modifier">✏️</button>
          <button class="btn btn-icon-sm btn-danger" onclick="deleteChannel(${ch.id},'${ch.name}')" title="Supprimer">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Search channels
const channelSearchInput = document.getElementById('channelSearch');
if (channelSearchInput) {
  channelSearchInput.addEventListener('input', debounce((e) => {
    adminState.channels.search = e.target.value;
    adminState.channels.page = 1;
    loadChannels();
  }, 400));
}

// Filter by category
const channelCatFilter = document.getElementById('channelCatFilter');
if (channelCatFilter) {
  channelCatFilter.addEventListener('change', () => {
    adminState.channels.category = channelCatFilter.value;
    adminState.channels.page = 1;
    loadChannels();
  });
}

function showChannelModal(channel = null) {
  const isEdit = !!channel;
  const cats = allCategories.map(c => `<option value="${c.id}" ${channel?.category_id == c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('');

  showModal({
    title: isEdit ? '✏️ Modifier la chaîne' : '+ Ajouter une chaîne',
    body: `
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="form-group">
          <label class="form-label">Nom *</label>
          <input class="form-control" id="chName" value="${channel?.name || ''}" placeholder="Nom de la chaîne" required>
        </div>
        <div class="form-group">
          <label class="form-label">URL du flux *</label>
          <input class="form-control" id="chUrl" value="${channel?.stream_url || ''}" placeholder="http://... ou rtmp://..." required>
        </div>
        <div class="form-group">
          <label class="form-label">Logo (URL)</label>
          <input class="form-control" id="chLogo" value="${channel?.logo || ''}" placeholder="https://...">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label class="form-label">Catégorie</label>
            <select class="form-control" id="chCat"><option value="">Aucune</option>${cats}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Qualité</label>
            <select class="form-control" id="chQuality">
              ${['SD','HD','FHD','4K','8K'].map(q => `<option ${channel?.quality === q ? 'selected' : ''}>${q}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label class="form-label">Pays</label>
            <input class="form-control" id="chCountry" value="${channel?.country || ''}" placeholder="FR">
          </div>
          <div class="form-group">
            <label class="form-label">Groupe</label>
            <input class="form-control" id="chGroup" value="${channel?.group_title || ''}" placeholder="News, Sports...">
          </div>
        </div>
        <div style="display:flex;gap:20px">
          <label class="checkbox-label">
            <input type="checkbox" id="chActive" ${!isEdit || channel?.is_active ? 'checked' : ''}>
            <span class="checkbox-custom"></span> Active
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="chFeatured" ${channel?.is_featured ? 'checked' : ''}>
            <span class="checkbox-custom"></span> À la une
          </label>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove();document.body.style.overflow=''">Annuler</button>
      <button class="btn btn-primary" onclick="saveChannel(${channel?.id || 'null'})">
        ${isEdit ? 'Sauvegarder' : 'Ajouter'}
      </button>
    `
  });
}

async function saveChannel(id) {
  const payload = {
    name: document.getElementById('chName').value.trim(),
    stream_url: document.getElementById('chUrl').value.trim(),
    logo: document.getElementById('chLogo').value.trim(),
    category_id: document.getElementById('chCat').value || null,
    quality: document.getElementById('chQuality').value,
    country: document.getElementById('chCountry').value.trim(),
    group_title: document.getElementById('chGroup').value.trim(),
    is_active: document.getElementById('chActive').checked,
    is_featured: document.getElementById('chFeatured').checked,
  };

  if (!payload.name || !payload.stream_url) {
    showToast('Nom et URL requis', 'error'); return;
  }

  try {
    if (id) {
      await apiFetch(`/admin/channels/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Chaîne mise à jour !', 'success');
    } else {
      await apiFetch('/admin/channels', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Chaîne ajoutée !', 'success');
    }
    document.querySelector('.modal-overlay')?.remove();
    document.body.style.overflow = '';
    loadChannels();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteChannel(id, name) {
  confirmDialog(`Supprimer "${name}" ? Cette action est irréversible.`, async () => {
    try {
      await apiFetch(`/admin/channels/${id}`, { method: 'DELETE' });
      showToast('Chaîne supprimée', 'success');
      loadChannels();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, { title: 'Supprimer la chaîne', danger: true });
}

// ─── USERS ────────────────────────────────────
async function loadUsers() {
  const { page, search, role } = adminState.users;
  const params = new URLSearchParams({ page, limit: 20, search, role });

  try {
    const data = await apiFetch(`/admin/users?${params}`);
    renderUsersTable(data.users);
    renderTablePagination('usersPagination', data.total, page, 20, (p) => {
      adminState.users.page = p; loadUsers();
    });
  } catch (err) {
    showToast('Erreur: ' + err.message, 'error');
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTbody');
  const planBadges = { free: 'badge-accent', premium: 'badge-gold', ultimate: 'badge-cyan', admin: 'badge-danger' };

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div class="user-name-cell">
          <div class="user-av-sm">${u.username[0].toUpperCase()}</div>
          <div>
            <div style="font-weight:600">${u.username}</div>
            <div style="font-size:0.72rem;color:var(--text-muted)">${u.last_login ? 'Vu ' + timeAgo(u.last_login) : 'Jamais connecté'}</div>
          </div>
        </div>
      </td>
      <td style="font-size:0.85rem;color:var(--text-secondary)">${u.email}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-danger' : 'badge-accent'}">${u.role}</span></td>
      <td><span class="badge ${planBadges[u.subscription_plan] || 'badge-accent'}">${u.subscription_plan}</span></td>
      <td>
        <span class="status-dot ${u.is_active ? 'status-active' : 'status-inactive'}"></span>
        ${u.is_active ? 'Actif' : 'Suspendu'}
      </td>
      <td style="font-size:0.85rem;color:var(--text-muted)">${formatDate(u.created_at)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-icon-sm btn-ghost" onclick="showUserModal(${JSON.stringify(u).replace(/"/g, '&quot;')})" title="Modifier">✏️</button>
          <button class="btn btn-icon-sm ${u.is_active ? 'btn-warning' : 'btn-success'}"
            onclick="toggleUserStatus(${u.id},${u.is_active},'${u.username}')"
            title="${u.is_active ? 'Suspendre' : 'Activer'}"
            style="${u.is_active ? 'background:var(--warning);color:#000' : 'background:var(--success);color:#000'}">
            ${u.is_active ? '⏸' : '▶'}
          </button>
          <button class="btn btn-icon-sm btn-danger" onclick="deleteUser(${u.id},'${u.username}')" title="Supprimer">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// User search
const userSearchInput = document.getElementById('userSearch');
if (userSearchInput) {
  userSearchInput.addEventListener('input', debounce((e) => {
    adminState.users.search = e.target.value;
    adminState.users.page = 1;
    loadUsers();
  }, 400));
}
const userRoleFilter = document.getElementById('userRoleFilter');
if (userRoleFilter) {
  userRoleFilter.addEventListener('change', () => {
    adminState.users.role = userRoleFilter.value;
    adminState.users.page = 1;
    loadUsers();
  });
}

function showUserModal(user) {
  showModal({
    title: '✏️ Modifier l\'utilisateur',
    body: `
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-elevated);border-radius:8px">
          <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#5a52d5);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff">
            ${user.username[0].toUpperCase()}
          </div>
          <div>
            <div style="font-weight:700">${user.username}</div>
            <div style="font-size:0.8rem;color:var(--text-muted)">${user.email}</div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Rôle</label>
          <select class="form-control" id="uRole">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>Utilisateur</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Plan d'abonnement</label>
          <select class="form-control" id="uPlan">
            ${['free','premium','ultimate'].map(p => `<option value="${p}" ${user.subscription_plan === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Nouveau mot de passe (optionnel)</label>
          <input type="password" class="form-control" id="uPassword" placeholder="Laisser vide pour ne pas changer">
        </div>
        <label class="checkbox-label">
          <input type="checkbox" id="uActive" ${user.is_active ? 'checked' : ''}>
          <span class="checkbox-custom"></span> Compte actif
        </label>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove();document.body.style.overflow=''">Annuler</button>
      <button class="btn btn-primary" onclick="saveUser(${user.id})">Sauvegarder</button>
    `
  });
}

async function saveUser(id) {
  const payload = {
    role: document.getElementById('uRole').value,
    subscription_plan: document.getElementById('uPlan').value,
    is_active: document.getElementById('uActive').checked,
  };
  const pw = document.getElementById('uPassword').value;
  if (pw) payload.password = pw;

  try {
    await apiFetch(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    showToast('Utilisateur mis à jour !', 'success');
    document.querySelector('.modal-overlay')?.remove();
    document.body.style.overflow = '';
    loadUsers();
  } catch (err) { showToast(err.message, 'error'); }
}

async function toggleUserStatus(id, isActive, name) {
  try {
    await apiFetch(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ is_active: !isActive }) });
    showToast(`${name} ${isActive ? 'suspendu' : 'activé'}`, isActive ? 'warning' : 'success');
    loadUsers();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteUser(id, name) {
  confirmDialog(`Supprimer définitivement l'utilisateur "${name}" ?`, async () => {
    try {
      await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
      showToast('Utilisateur supprimé', 'success');
      loadUsers();
    } catch (err) { showToast(err.message, 'error'); }
  }, { title: 'Supprimer l\'utilisateur', danger: true });
}

// ─── CATEGORIES ───────────────────────────────
async function loadCategories() {
  try {
    allCategories = await apiFetch('/admin/categories');
    // Populate all category selects
    const opts = allCategories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
    ['channelCatFilter', 'importCategory'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.insertAdjacentHTML('beforeend', opts);
    });
  } catch {}
}

async function loadCategoriesAdmin() {
  try {
    const cats = await apiFetch('/admin/categories');
    const grid = document.getElementById('categoriesGrid');
    grid.innerHTML = cats.map(c => `
      <div class="cat-admin-card">
        <div class="cat-icon-big">${c.icon}</div>
        <div class="cat-admin-info">
          <div class="cat-admin-name">${c.name}</div>
          <div class="cat-admin-count">Slug: ${c.slug}</div>
        </div>
        <div class="cat-admin-actions">
          <button class="btn btn-icon-sm btn-ghost" onclick="showCategoryModal(${JSON.stringify(c).replace(/"/g,'&quot;')})" title="Modifier">✏️</button>
          <button class="btn btn-icon-sm btn-danger" onclick="deleteCategory(${c.id},'${c.name}')" title="Supprimer">🗑</button>
        </div>
      </div>
    `).join('');
  } catch {}
}

function showCategoryModal(cat = null) {
  showModal({
    title: cat ? '✏️ Modifier la catégorie' : '+ Nouvelle catégorie',
    body: `
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="form-group"><label class="form-label">Nom *</label><input class="form-control" id="catName" value="${cat?.name || ''}" placeholder="ex: Sports"></div>
        <div class="form-group"><label class="form-label">Slug *</label><input class="form-control" id="catSlug" value="${cat?.slug || ''}" placeholder="ex: sports"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group"><label class="form-label">Icône</label><input class="form-control" id="catIcon" value="${cat?.icon || '📺'}" placeholder="📺"></div>
          <div class="form-group"><label class="form-label">Couleur</label><input type="color" class="form-control" id="catColor" value="${cat?.color || '#6c63ff'}" style="padding:4px;height:44px"></div>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove();document.body.style.overflow=''">Annuler</button>
      <button class="btn btn-primary" onclick="saveCategory(${cat?.id || 'null'})">${cat ? 'Sauvegarder' : 'Créer'}</button>
    `
  });

  // Auto-fill slug
  if (!cat) {
    document.getElementById('catName').addEventListener('input', (e) => {
      document.getElementById('catSlug').value = slugify(e.target.value);
    });
  }
}

async function saveCategory(id) {
  const payload = {
    name: document.getElementById('catName').value.trim(),
    slug: document.getElementById('catSlug').value.trim(),
    icon: document.getElementById('catIcon').value.trim(),
    color: document.getElementById('catColor').value,
  };
  if (!payload.name || !payload.slug) { showToast('Nom et slug requis', 'error'); return; }

  try {
    if (id) {
      await apiFetch(`/admin/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Catégorie mise à jour !', 'success');
    } else {
      await apiFetch('/admin/categories', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Catégorie créée !', 'success');
    }
    document.querySelector('.modal-overlay')?.remove();
    document.body.style.overflow = '';
    loadCategoriesAdmin();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteCategory(id, name) {
  confirmDialog(`Supprimer la catégorie "${name}" ?`, async () => {
    try {
      await apiFetch(`/admin/categories/${id}`, { method: 'DELETE' });
      showToast('Catégorie supprimée', 'success');
      loadCategoriesAdmin();
    } catch (err) { showToast(err.message, 'error'); }
  }, { danger: true });
}

// ─── IMPORT M3U ───────────────────────────────
function initImport() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('m3uFile');
  const fileInfo = document.getElementById('importFileInfo');
  const fileName = document.getElementById('importFileName');

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault(); dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) setImportFile(file);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) setImportFile(fileInput.files[0]);
  });

  function setImportFile(file) {
    fileInput.file = file;
    fileName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    fileInfo.classList.remove('hidden');
    dropZone.style.display = 'none';
  }

  document.getElementById('importForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = fileInput.file || fileInput.files[0];
    if (!file) { showToast('Sélectionnez un fichier M3U', 'error'); return; }

    const btn = document.getElementById('importBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Importation en cours...';

    const formData = new FormData();
    formData.append('file', file);
    formData.append('category_id', document.getElementById('importCategory').value);
    formData.append('overwrite', document.getElementById('importOverwrite').checked);

    try {
      const token = Auth.getToken();
      const res = await fetch('/api/admin/import-m3u', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const result = document.getElementById('importResult');
      result.className = 'import-result success';
      result.innerHTML = `
        <h3 style="margin-bottom:12px">✅ Importation réussie !</h3>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;text-align:center">
          <div><div style="font-size:1.5rem;font-weight:700;color:var(--success)">${data.imported}</div><div style="font-size:0.8rem;color:var(--text-muted)">Importées</div></div>
          <div><div style="font-size:1.5rem;font-weight:700;color:var(--warning)">${data.updated}</div><div style="font-size:0.8rem;color:var(--text-muted)">Mises à jour</div></div>
          <div><div style="font-size:1.5rem;font-weight:700;color:var(--text-muted)">${data.skipped}</div><div style="font-size:0.8rem;color:var(--text-muted)">Ignorées</div></div>
          <div><div style="font-size:1.5rem;font-weight:700">${data.total}</div><div style="font-size:0.8rem;color:var(--text-muted)">Total</div></div>
        </div>
      `;
      result.classList.remove('hidden');
      showToast(`${data.imported} chaînes importées !`, 'success');
    } catch (err) {
      const result = document.getElementById('importResult');
      result.className = 'import-result error';
      result.innerHTML = `<h3>❌ Erreur</h3><p>${err.message}</p>`;
      result.classList.remove('hidden');
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '📥 Lancer l\'importation';
    }
  });
}

function clearImportFile() {
  document.getElementById('importFileInfo').classList.add('hidden');
  document.getElementById('dropZone').style.display = '';
  document.getElementById('m3uFile').value = '';
  document.getElementById('m3uFile').file = null;
}

// ─── PAGINATION HELPER ────────────────────────
function renderTablePagination(containerId, total, currentPage, limit, onPage) {
  const pages = Math.ceil(total / limit);
  const container = document.getElementById(containerId);
  if (pages <= 1) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <span style="font-size:0.8rem;color:var(--text-muted)">${total} résultats · Page ${currentPage}/${pages}</span>
    <button class="btn btn-ghost btn-sm" ${currentPage <= 1 ? 'disabled' : ''} onclick="(${onPage.toString()})(${currentPage - 1})">←</button>
    <button class="btn btn-ghost btn-sm" ${currentPage >= pages ? 'disabled' : ''} onclick="(${onPage.toString()})(${currentPage + 1})">→</button>
  `;
}

// ─── LOGOUT ───────────────────────────────────
async function doLogout() {
  try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
  Auth.clear();
  window.location.href = '/';
}

// ─── START ────────────────────────────────────
init();
