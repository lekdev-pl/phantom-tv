/* ═══════════════════════════════════════════════
   PHANTOM TV — Player JS (HLS)
   ═══════════════════════════════════════════════ */

if (!requireAuth()) throw new Error('Auth required');

// ─── STATE ────────────────────────────────────
const channelId = window.location.pathname.split('/').pop();
let hls = null;
let channel = null;
let isFavorite = false;
let watchTimer = null;
let watchStart = Date.now();
let controlsTimeout = null;

// ─── DOM ──────────────────────────────────────
const video = document.getElementById('mainVideo');
const loadingOverlay = document.getElementById('playerLoading');
const errorOverlay = document.getElementById('playerError');
const controlsWrap = document.getElementById('controlsWrap');
const playPauseBtn = document.getElementById('playPauseBtn');
const centerPlayBtn = document.getElementById('centerPlayBtn');
const centerPlayIcon = document.getElementById('centerPlayIcon');
const muteBtn = document.getElementById('muteBtn');
const volumeSlider = document.getElementById('volumeSlider');
const qualitySelect = document.getElementById('qualitySelect');
const favBtn = document.getElementById('favBtn');

// ─── INIT ─────────────────────────────────────
async function init() {
  // Set user avatar
  const user = Auth.getUser();
  if (user) document.getElementById('playerUserAv').textContent = user.username[0].toUpperCase();

  await loadChannel();
  loadSidebarChannels();
}

// ─── LOAD CHANNEL ─────────────────────────────
async function loadChannel() {
  try {
    channel = await apiFetch(`/channels/${channelId}`);
    isFavorite = channel.is_favorite;

    updateUI(channel);
    loadStream(channel.stream_url);
    loadEpg();

    // Update fav button
    updateFavBtn();
  } catch (err) {
    showError('Chaîne introuvable ou inaccessible.');
    console.error(err);
  }
}

function updateUI(ch) {
  document.title = `${ch.name} — PHANTOM TV`;

  // Top bar
  document.getElementById('npChannel').textContent = ch.name;

  // Info bar
  document.getElementById('pibName').textContent = ch.name;
  document.getElementById('pibMeta').textContent = [
    ch.category_icon, ch.category_name, ch.country ? `🌍 ${ch.country}` : '', ch.quality
  ].filter(Boolean).join(' · ');
  document.getElementById('pibViews').textContent = `👁 ${formatNumber(ch.views)} vues`;

  const logoEl = document.getElementById('pibLogo');
  if (ch.logo) {
    logoEl.innerHTML = `<img src="${ch.logo}" alt="${ch.name}" onerror="this.style.display='none'">`;
  }

  document.getElementById('loadingName').textContent = ch.name;
}

// ─── HLS STREAM ───────────────────────────────
function loadStream(url) {
  if (hls) { hls.destroy(); hls = null; }

  if (Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      maxBufferLength: 30,
      startLevel: -1,
    });

    hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      loadingOverlay.style.display = 'none';
      errorOverlay.classList.add('hidden');

      // Populate quality options
      qualitySelect.innerHTML = '<option value="-1">Auto</option>' +
        data.levels.map((l, i) => `<option value="${i}">${l.height}p</option>`).join('');

      video.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            document.getElementById('errorMsg').textContent = 'Flux indisponible. Réessayez.';
            showError();
            break;
        }
      }
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
      const level = hls.levels[data.level];
      if (level) document.getElementById('ctrlTime').textContent = `LIVE • ${level.height}p`;
    });

    hls.loadSource(url);
    hls.attachMedia(video);

    qualitySelect.addEventListener('change', () => {
      hls.currentLevel = parseInt(qualitySelect.value);
    });

  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Native HLS (Safari/iOS)
    video.src = url;
    video.addEventListener('loadedmetadata', () => {
      loadingOverlay.style.display = 'none';
      video.play().catch(() => {});
    });
  } else {
    showError('Votre navigateur ne supporte pas HLS.');
    return;
  }

  // Start watch timer
  watchStart = Date.now();
  watchTimer = setInterval(() => {
    const duration = Math.floor((Date.now() - watchStart) / 1000);
    apiFetch(`/channels/${channelId}/watch`, {
      method: 'POST',
      body: JSON.stringify({ duration })
    }).catch(() => {});
  }, 60000);
}

function retryStream() {
  if (!channel) return;
  errorOverlay.classList.add('hidden');
  loadingOverlay.style.display = '';
  setTimeout(() => loadStream(channel.stream_url), 1000);
}

function showError(msg) {
  loadingOverlay.style.display = 'none';
  errorOverlay.classList.remove('hidden');
  if (msg) document.getElementById('errorMsg').textContent = msg;
}

// ─── PLAYER CONTROLS ──────────────────────────
function togglePlay() {
  if (video.paused) { video.play(); } else { video.pause(); }
  flashCenter();
}

function flashCenter() {
  centerPlayBtn.classList.remove('flash');
  centerPlayIcon.textContent = video.paused ? '▶' : '⏸';
  void centerPlayBtn.offsetWidth;
  centerPlayBtn.classList.add('flash');
}

video.addEventListener('play', () => {
  playPauseBtn.textContent = '⏸';
});
video.addEventListener('pause', () => {
  playPauseBtn.textContent = '▶';
});
video.addEventListener('waiting', () => {
  loadingOverlay.style.display = '';
  loadingOverlay.querySelector('.loading-sub').textContent = 'Buffering...';
  loadingOverlay.querySelector('.loading-logo').style.display = 'none';
});
video.addEventListener('playing', () => {
  loadingOverlay.style.display = 'none';
});

// Play/Pause controls
playPauseBtn.addEventListener('click', togglePlay);
document.getElementById('videoCenterZone').addEventListener('click', togglePlay);

// Double click fullscreen
document.getElementById('videoCenterZone').addEventListener('dblclick', toggleFullscreen);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  switch (e.key) {
    case ' ': case 'k': e.preventDefault(); togglePlay(); break;
    case 'f': toggleFullscreen(); break;
    case 'm': toggleMute(); break;
    case 'ArrowUp': e.preventDefault(); adjustVolume(0.1); break;
    case 'ArrowDown': e.preventDefault(); adjustVolume(-0.1); break;
    case 'p': pip(); break;
  }
});

// Volume
function adjustVolume(delta) {
  video.volume = Math.min(1, Math.max(0, video.volume + delta));
  volumeSlider.value = video.volume;
  updateVolumeBtnIcon();
}

function toggleMute() {
  video.muted = !video.muted;
  updateVolumeBtnIcon();
}

function updateVolumeBtnIcon() {
  if (video.muted || video.volume === 0) muteBtn.textContent = '🔇';
  else if (video.volume < 0.5) muteBtn.textContent = '🔉';
  else muteBtn.textContent = '🔊';
}

muteBtn.addEventListener('click', toggleMute);
volumeSlider.addEventListener('input', () => {
  video.volume = parseFloat(volumeSlider.value);
  if (video.volume > 0) video.muted = false;
  updateVolumeBtnIcon();
});

// Fullscreen
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.getElementById('videoWrap').requestFullscreen?.() ||
    document.getElementById('videoWrap').webkitRequestFullscreen?.();
  } else {
    document.exitFullscreen?.() || document.webkitExitFullscreen?.();
  }
}
document.getElementById('fsBtn').addEventListener('click', toggleFullscreen);

document.addEventListener('fullscreenchange', () => {
  const btn = document.getElementById('fsBtn');
  btn.textContent = document.fullscreenElement ? '✕' : '⛶';
});

// PiP
async function pip() {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled) {
      await video.requestPictureInPicture();
    }
  } catch {}
}
document.getElementById('pipBtn').addEventListener('click', pip);

// Auto-hide controls
const videoWrap = document.getElementById('videoWrap');
videoWrap.addEventListener('mousemove', () => {
  controlsWrap.classList.add('visible');
  clearTimeout(controlsTimeout);
  controlsTimeout = setTimeout(() => {
    if (!video.paused) controlsWrap.classList.remove('visible');
  }, 3000);
});
videoWrap.addEventListener('mouseleave', () => {
  if (!video.paused) controlsWrap.classList.remove('visible');
});

// ─── FAVORITES ────────────────────────────────
function updateFavBtn() {
  favBtn.textContent = isFavorite ? '⭐ Favoris' : '☆ Favoris';
  favBtn.style.color = isFavorite ? 'var(--gold)' : '';
}

async function toggleChannelFav() {
  try {
    if (isFavorite) {
      await apiFetch(`/channels/${channelId}/favorite`, { method: 'DELETE' });
      isFavorite = false;
      showToast('Retiré des favoris', 'info', 2000);
    } else {
      await apiFetch(`/channels/${channelId}/favorite`, { method: 'POST' });
      isFavorite = true;
      showToast('Ajouté aux favoris !', 'success', 2000);
    }
    updateFavBtn();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── EPG ──────────────────────────────────────
async function loadEpg() {
  try {
    const data = await apiFetch(`/channels/${channelId}/epg`);
    const list = document.getElementById('epgList');
    const now = new Date();

    if (!data.programs.length) {
      list.innerHTML = '<div class="epg-loading">Aucun programme disponible pour ce canal.</div>';

      // Update now playing
      document.getElementById('npProgram').textContent = 'En direct';
      return;
    }

    if (data.current) {
      document.getElementById('npProgram').textContent = data.current.title;
    }

    list.innerHTML = data.programs.map(p => {
      const start = new Date(p.start_time);
      const end = new Date(p.end_time);
      const isCurrent = p.start_time <= now.toISOString() && p.end_time > now.toISOString();
      const isPast = p.end_time <= now.toISOString();

      let progress = 0;
      if (isCurrent) {
        progress = ((now - start) / (end - start)) * 100;
      } else if (!isPast) {
        progress = 0;
      } else {
        progress = 100;
      }

      return `
        <div class="epg-item ${isCurrent ? 'current' : ''} ${isPast ? 'past' : ''}">
          <div class="epg-time">${formatTime(p.start_time)}<br>${formatTime(p.end_time)}</div>
          <div class="epg-prog-info">
            <div class="epg-prog-title">${p.title}</div>
            ${p.description ? `<div class="epg-prog-desc">${p.description}</div>` : ''}
            ${isCurrent ? `<div class="epg-prog-bar"><div class="epg-prog-fill" style="width:${progress}%"></div></div>` : ''}
          </div>
          ${isCurrent ? '<span class="epg-live-badge">EN COURS</span>' : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    document.getElementById('epgList').innerHTML = '<div class="epg-loading">Erreur lors du chargement.</div>';
  }
}

// ─── SIDEBAR CHANNELS ─────────────────────────
async function loadSidebarChannels() {
  try {
    const data = await apiFetch('/channels?limit=50&sort=views');
    const container = document.getElementById('psChannels');

    function renderChannels(channels) {
      container.innerHTML = channels.map(ch => `
        <div class="ps-channel-item ${ch.id == channelId ? 'active' : ''}" onclick="switchChannel(${ch.id})">
          <div class="ps-ch-logo">
            ${ch.logo ? `<img src="${ch.logo}" alt="${ch.name}" onerror="this.style.display='none'">` : '📺'}
          </div>
          <div class="ps-ch-info">
            <div class="ps-ch-name">${ch.name}</div>
            <div class="ps-ch-cat">${ch.category_icon || ''} ${ch.category_name || ''}</div>
          </div>
          <span class="ps-ch-quality">${ch.quality}</span>
        </div>
      `).join('');
    }

    renderChannels(data.channels);

    // Search in sidebar
    const psSearch = document.getElementById('psSearch');
    psSearch.addEventListener('input', debounce((e) => {
      const q = e.target.value.toLowerCase();
      const filtered = q ? data.channels.filter(ch => ch.name.toLowerCase().includes(q)) : data.channels;
      renderChannels(filtered);
    }, 200));
  } catch {}
}

function switchChannel(id) {
  if (watchTimer) clearInterval(watchTimer);
  window.location.href = `/watch/${id}`;
}

// ─── CLEANUP ──────────────────────────────────
window.addEventListener('beforeunload', () => {
  if (watchTimer) clearInterval(watchTimer);
  const duration = Math.floor((Date.now() - watchStart) / 1000);
  if (duration > 10) {
    navigator.sendBeacon(`/api/channels/${channelId}/watch`, JSON.stringify({ duration }));
  }
  if (hls) hls.destroy();
});

// ─── START ────────────────────────────────────
init();
