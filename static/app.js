/* SongPlay — front-end controller
   Talks to our Flask backend at /api/search & /api/suggest.
*/

const API = '/api';
const audio = document.getElementById('audio');

const $ = (id) => document.getElementById(id);
const els = {
  form: $('searchForm'),
  input: $('searchInput'),
  results: $('results'),
  status: $('status'),
  resultsTitle: $('resultsTitle'),
  resultsSub: $('resultsSub'),
  resultMeta: $('resultMeta'),
  resultCount: $('resultCount'),
  clearBtn: $('clearBtn'),
  cover: $('cover'),
  nowTitle: $('nowTitle'),
  nowArtist: $('nowArtist'),
  playBtn: $('playBtn'),
  playIcon: $('playIcon'),
  prevBtn: $('prevBtn'),
  nextBtn: $('nextBtn'),
  shuffleBtn: $('shuffleBtn'),
  loopBtn: $('loopBtn'),
  muteBtn: $('muteBtn'),
  volIcon: $('volIcon'),
  volume: $('volume'),
  volFill: $('volFill'),
  progress: $('progress'),
  progressFill: $('progressFill'),
  progressThumb: $('progressThumb'),
  curTime: $('curTime'),
  durTime: $('durTime'),
  chips: $('chips'),
  moodGrid: $('moodGrid'),
  queueBtn: $('queueBtn'),
  mobileQueue: $('mobileQueue'),
  queue: $('queue'),
  closeQueue: $('closeQueue'),
  queueList: $('queueList'),
  toast: $('toast'),
  vinyl: $('vinyl'),
  themeToggle: $('themeToggle'),
  scrim: $('scrim'),
};

const state = {
  tracks: [],
  queue: [],
  currentIdx: -1,
  isPlaying: false,
  shuffle: false,
  loop: false,
  lastVolume: 0.7,
  currentQuery: '',
  inFlight: null,
  user: null,
  playlists: [],
};

audio.volume = state.lastVolume;
setVolUI(state.lastVolume);

/* =====================================================================
   Search
   ===================================================================== */
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = els.input.value.trim();
  if (q) doSearch(q, `"${q}"`);
});

els.chips.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-q]');
  if (btn) doSearch(btn.dataset.q, btn.textContent);
});

els.clearBtn.addEventListener('click', () => {
  els.input.value = '';
  state.tracks = [];
  state.currentQuery = '';
  renderResults([]);
  els.resultsTitle.textContent = 'Trending today';
  els.resultsSub.textContent = 'Fresh tracks, handpicked to start your session.';
  els.resultMeta.hidden = true;
  els.status.textContent = '';
});

function showLoading() {
  els.results.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const card = document.createElement('div');
    card.className = 'card skeleton-card';
    card.innerHTML = `
      <div class="art skeleton"></div>
      <div class="line skeleton"></div>
      <div class="line short skeleton"></div>
    `;
    card.style.animationDelay = `${i * 60}ms`;
    els.results.appendChild(card);
  }
  els.status.textContent = '';
}

async function doSearch(q, label) {
  if (state.inFlight) state.inFlight.abort();
  const ctrl = new AbortController();
  state.inFlight = ctrl;
  state.currentQuery = q;
  els.resultsTitle.textContent = label ? `Results for ${label}` : `Results`;
  els.resultsSub.textContent = 'Tap a card to play. Hit + to queue.';
  showLoading();
  try {
    const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.tracks = data.results || [];
    renderResults(state.tracks);
    els.resultMeta.hidden = false;
    els.resultCount.textContent = `${data.count} track${data.count === 1 ? '' : 's'}`;
    if (!data.count) {
      els.status.textContent = 'No previews found. Try another search.';
    } else {
      els.status.textContent = data.cached ? 'Loaded from cache ⚡' : '';
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error(err);
    els.results.innerHTML = '';
    els.status.textContent = 'Could not reach the server. Check your connection and try again.';
    els.resultMeta.hidden = true;
  }
}

function renderResults(tracks) {
  els.results.innerHTML = '';
  if (!tracks.length) return;
  const frag = document.createDocumentFragment();
  tracks.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.animationDelay = `${Math.min(i, 12) * 30}ms`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Play ${t.title} by ${t.artist}`);
    card.innerHTML = `
      <div class="art">
        <img loading="lazy" alt="" src="${esc(t.cover)}" onerror="this.style.display='none'">
        <div class="play-overlay"><div class="pp">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div></div>
      </div>
      <button class="save-btn" aria-label="Save to playlist" title="Save to playlist">❤️</button>
      <button class="add-btn" aria-label="Add to queue" title="Add to queue">+</button>
      <div class="name">${esc(t.title)}</div>
      <div class="sub">${esc(t.artist)}${t.album ? ' · ' + esc(t.album) : ''}${t.duration_ms ? ' · ' + fmt(t.duration_ms / 1000) : ''}</div>
    `;
    card.querySelector('.art').addEventListener('click', () => playFromResults(i));
    card.querySelector('.save-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openAddToPlaylistModal(t);
    });
    card.querySelector('.add-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      addToQueue(t);
      showToast(`Added “${t.title}” to queue`);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playFromResults(i); }
    });
    frag.appendChild(card);
  });
  els.results.appendChild(frag);
}

/* =====================================================================
   Moods
   ===================================================================== */
async function loadMoods() {
  try {
    const res = await fetch(`${API}/suggest`);
    if (!res.ok) throw new Error('failed');
    const data = await res.json();
    renderMoods(data.packs || []);
  } catch (e) {
    console.error(e);
  }
}
function renderMoods(packs) {
  els.moodGrid.innerHTML = '';
  packs.forEach((m) => {
    const div = document.createElement('button');
    div.className = 'mood';
    div.style.background = m.color;
    div.setAttribute('aria-label', `Browse ${m.name}`);
    div.innerHTML = `<span class="ico" aria-hidden="true">${m.icon}</span><span class="name">${esc(m.name)}</span>`;
    div.addEventListener('click', () => {
      els.input.value = m.name;
      doSearch(m.q, m.name);
      document.getElementById('trending').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    els.moodGrid.appendChild(div);
  });
}

/* =====================================================================
   Playback
   ===================================================================== */
function playFromResults(i) {
  if (!state.tracks[i]) return;
  state.queue = state.tracks.slice();
  state.currentIdx = i;
  playCurrent();
}

function playCurrent() {
  const t = state.queue[state.currentIdx];
  if (!t) return;
  if (t.duration_ms) {
    els.durTime.textContent = fmt(t.duration_ms / 1000);
  }
  audio.src = t.preview;
  audio.play().then(() => {
    state.isPlaying = true;
    updatePlayerUI();
  }).catch(() => {
    state.isPlaying = false;
    updatePlayerUI();
  });
  updatePlayerUI();
}

function updatePlayerUI() {
  const t = state.queue[state.currentIdx];
  if (t) {
    els.nowTitle.textContent = t.title;
    els.nowArtist.textContent = t.artist + (t.album ? ` · ${t.album}` : '');
    if (t.cover) {
      els.cover.innerHTML = `<img alt="" src="${esc(t.cover)}">`;
    }
    document.title = `${t.title} • ${t.artist} — SongPlay`;
  } else {
    els.nowTitle.textContent = 'Nothing playing';
    els.nowArtist.textContent = 'Search a song to begin';
    els.cover.innerHTML = `<div class="cover-fallback"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg></div>`;
    document.title = 'SongPlay — feel the beat';
  }
  els.cover.classList.toggle('playing', state.isPlaying);
  els.vinyl.classList.toggle('playing', state.isPlaying);
  els.playIcon.innerHTML = state.isPlaying
    ? '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>'
    : '<path d="M8 5v14l11-7z"/>';
  highlightCurrentCard();
  renderQueue();
}

function highlightCurrentCard() {
  const t = state.queue[state.currentIdx];
  if (!t) return;
  document.querySelectorAll('.card').forEach((c, i) => {
    const tr = state.tracks[i];
    c.classList.toggle('is-current', !!(tr && tr.id === t.id && state.isPlaying));
  });
}

els.playBtn.addEventListener('click', () => {
  if (!state.queue.length && state.tracks.length) {
    state.queue = state.tracks.slice();
    state.currentIdx = 0;
    playCurrent();
    return;
  }
  if (!state.queue.length) { showToast('Search a song first'); return; }
  if (audio.paused) {
    if (audio.src) audio.play();
    else playCurrent();
  } else {
    audio.pause();
  }
});

els.nextBtn.addEventListener('click', nextTrack);
els.prevBtn.addEventListener('click', prevTrack);

function nextTrack() {
  if (!state.queue.length) return;
  if (state.shuffle) {
    let n; do { n = Math.floor(Math.random() * state.queue.length); } while (n === state.currentIdx && state.queue.length > 1);
    state.currentIdx = n;
  } else {
    state.currentIdx = (state.currentIdx + 1) % state.queue.length;
  }
  playCurrent();
}
function prevTrack() {
  if (!state.queue.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  state.currentIdx = (state.currentIdx - 1 + state.queue.length) % state.queue.length;
  playCurrent();
}

els.shuffleBtn.addEventListener('click', () => {
  state.shuffle = !state.shuffle;
  els.shuffleBtn.classList.toggle('active', state.shuffle);
  showToast(state.shuffle ? 'Shuffle on' : 'Shuffle off');
});
els.loopBtn.addEventListener('click', () => {
  state.loop = !state.loop;
  audio.loop = state.loop;
  els.loopBtn.classList.toggle('active', state.loop);
  showToast(state.loop ? 'Loop on' : 'Loop off');
});

audio.addEventListener('ended', () => { if (state.loop) { audio.play(); return; } nextTrack(); });
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  els.progressFill.style.width = pct + '%';
  els.progressThumb.style.left = pct + '%';
  els.progress.setAttribute('aria-valuenow', String(Math.round(pct)));
  els.curTime.textContent = fmt(audio.currentTime);
  els.durTime.textContent = fmt(audio.duration);
});
audio.addEventListener('loadedmetadata', () => { els.durTime.textContent = fmt(audio.duration); });
audio.addEventListener('play',  () => { state.isPlaying = true;  updatePlayerUI(); });
audio.addEventListener('pause', () => { state.isPlaying = false; updatePlayerUI(); });
audio.addEventListener('error', () => {
  if (state.queue.length > 1) {
    showToast('Track unavailable, playing next...');
    setTimeout(nextTrack, 1000);
  } else {
    showToast('Unable to stream this track.');
  }
});

/* progress seek */
function seekFromEvent(e) {
  if (!audio.duration) return;
  const rect = els.progress.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.currentTime = ratio * audio.duration;
}
let draggingProgress = false;
els.progress.addEventListener('mousedown', (e) => { draggingProgress = true; seekFromEvent(e); });
window.addEventListener('mousemove', (e) => { if (draggingProgress) seekFromEvent(e); });
window.addEventListener('mouseup', () => { draggingProgress = false; });
els.progress.addEventListener('touchstart', (e) => seekFromEvent(e.touches[0]), { passive: true });
els.progress.addEventListener('touchmove', (e) => seekFromEvent(e.touches[0]), { passive: true });
els.progress.addEventListener('keydown', (e) => {
  if (!audio.duration) return;
  if (e.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); }
  if (e.key === 'ArrowLeft')  { audio.currentTime = Math.max(0, audio.currentTime - 5); }
});

/* volume */
els.muteBtn.addEventListener('click', () => {
  if (audio.volume > 0) { state.lastVolume = audio.volume; audio.volume = 0; }
  else { audio.volume = state.lastVolume || 0.7; }
  setVolUI(audio.volume);
});
function setVolFromEvent(e) {
  const rect = els.volume.getBoundingClientRect();
  const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.volume = v; state.lastVolume = v; setVolUI(v);
}
els.volume.addEventListener('click', setVolFromEvent);
let draggingVol = false;
els.volume.addEventListener('mousedown', (e) => { draggingVol = true; setVolFromEvent(e); });
window.addEventListener('mousemove', (e) => { if (draggingVol) setVolFromEvent(e); });
window.addEventListener('mouseup', () => { draggingVol = false; });

function setVolUI(v) {
  els.volFill.style.width = (v * 100) + '%';
  els.volume.setAttribute('aria-valuenow', String(Math.round(v * 100)));
  els.volIcon.innerHTML = v === 0
    ? '<path d="M16.5 12a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zM3 9v6h4l5 5V4L7 9H3z"/><path d="M19 5l-1.4 1.4 2.6 2.6-2.6 2.6L19 13l4-4z" opacity=".7"/>'
    : '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z"/>';
}

/* =====================================================================
   Queue
   ===================================================================== */
function addToQueue(track) {
  if (state.queue.find(t => t.id === track.id)) {
    showToast('Already in queue');
    return;
  }
  state.queue.push(track);
  if (state.currentIdx < 0) { state.currentIdx = 0; }
  renderQueue();
}
function removeFromQueue(i) {
  const wasCurrent = i === state.currentIdx;
  state.queue.splice(i, 1);
  if (wasCurrent) {
    if (state.queue.length) { state.currentIdx = Math.min(state.currentIdx, state.queue.length - 1); playCurrent(); }
    else { state.currentIdx = -1; audio.pause(); audio.removeAttribute('src'); audio.load(); updatePlayerUI(); }
  } else if (i < state.currentIdx) {
    state.currentIdx--;
  }
  renderQueue();
}
function renderQueue() {
  els.queueList.innerHTML = '';
  if (!state.queue.length) {
    els.queueList.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">Queue is empty — add some tracks!</div>';
    return;
  }
  state.queue.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'queue-item' + (i === state.currentIdx ? ' active' : '');
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    div.innerHTML = `
      <img class="qimg" alt="" src="${esc(t.cover)}" onerror="this.style.background='var(--surface)'">
      <div class="qmeta">
        <div class="qtitle">${esc(t.title)}</div>
        <div class="qartist">${esc(t.artist)}</div>
      </div>
      <button class="qrm" aria-label="Remove" title="Remove">×</button>
    `;
    div.addEventListener('click', (e) => {
      if (e.target.closest('.qrm')) { removeFromQueue(i); return; }
      state.currentIdx = i; playCurrent();
    });
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.currentIdx = i; playCurrent(); }
    });
    els.queueList.appendChild(div);
  });
}

function openQueue() { els.queue.classList.add('open'); els.queue.setAttribute('aria-hidden', 'false'); els.scrim.classList.add('show'); }
function closeQueue() { els.queue.classList.remove('open'); els.scrim.classList.remove('show'); }
els.queueBtn.addEventListener('click', () => els.queue.classList.contains('open') ? closeQueue() : openQueue());
els.mobileQueue.addEventListener('click', openQueue);
els.closeQueue.addEventListener('click', closeQueue);
els.scrim.addEventListener('click', closeQueue);

/* =====================================================================
   Theme
   ===================================================================== */
const storedTheme = localStorage.getItem('songplay-theme');
if (storedTheme) document.documentElement.setAttribute('data-theme', storedTheme);
els.themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('songplay-theme', next);
  showToast(next === 'light' ? 'Light theme' : 'Dark theme');
});

/* =====================================================================
   Keyboard
   ===================================================================== */
window.addEventListener('keydown', (e) => {
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  if (e.code === 'Space') { e.preventDefault(); els.playBtn.click(); }
  else if (e.code === 'ArrowRight') nextTrack();
  else if (e.code === 'ArrowLeft') prevTrack();
  else if (e.key === 'm' || e.key === 'M') els.muteBtn.click();
  else if (e.key === 'q' || e.key === 'Q') els.queueBtn.click();
  else if (e.key === 'Escape') closeQueue();
});

/* =====================================================================
   Helpers
   ===================================================================== */
function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
let toastTimer;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1800);
}

/* =====================================================================
   Auth & Playlists
   ===================================================================== */
let authMode = 'login';
let targetTrackForPlaylist = null;
let currentViewingPlaylistId = null;

const authEls = {
  openBtn: $('openAuthBtn'),
  userProfile: $('userProfile'),
  authActions: $('authActions'),
  displayUsername: $('displayUsername'),
  logoutBtn: $('logoutBtn'),
  modal: $('authModal'),
  closeBtn: $('closeAuthModal'),
  tabSignIn: $('tabSignIn'),
  tabSignUp: $('tabSignUp'),
  form: $('authForm'),
  title: $('authModalTitle'),
  sub: $('authModalSubtitle'),
  username: $('authUsername'),
  password: $('authPassword'),
  submitBtn: $('authSubmitBtn'),
  errorMsg: $('authErrorMsg'),
  gateCard: $('playlistsAuthGate'),
  gateSignIn: $('gateSignInBtn'),
  gateSignUp: $('gateSignUpBtn'),
  grid: $('playlistsGrid'),
  sectionActions: $('playlistSectionActions'),
  openNewPlBtn: $('openCreatePlaylistBtn'),
  newPlModal: $('newPlaylistModal'),
  closeNewPlBtn: $('closeNewPlaylistModal'),
  cancelNewPlBtn: $('cancelNewPlaylistBtn'),
  newPlForm: $('newPlaylistForm'),
  newPlName: $('newPlaylistName'),
  detailModal: $('playlistDetailModal'),
  closeDetailModal: $('closePlaylistDetailModal'),
  detailName: $('detailPlaylistName'),
  detailMeta: $('detailPlaylistMeta'),
  detailTracks: $('detailTrackList'),
  playAllBtn: $('playAllPlaylistBtn'),
  deletePlBtn: $('deletePlaylistBtn'),
  addModal: $('addToPlaylistModal'),
  closeAddModal: $('closeAddToPlaylistModal'),
  addMeta: $('addTrackTitleArtist'),
  addOptions: $('addToPlaylistOptions'),
  quickCreateBtn: $('quickCreatePlaylistBtn'),
};

function setAuthMode(mode) {
  authMode = mode;
  authEls.errorMsg.hidden = true;
  authEls.errorMsg.textContent = '';
  if (mode === 'login') {
    authEls.tabSignIn.classList.add('active');
    authEls.tabSignIn.setAttribute('aria-selected', 'true');
    authEls.tabSignUp.classList.remove('active');
    authEls.tabSignUp.setAttribute('aria-selected', 'false');
    authEls.title.textContent = 'Welcome back';
    authEls.sub.textContent = 'Enter your password to unlock your playlists.';
    authEls.submitBtn.innerHTML = '<span>Sign In</span>';
  } else {
    authEls.tabSignUp.classList.add('active');
    authEls.tabSignUp.setAttribute('aria-selected', 'true');
    authEls.tabSignIn.classList.remove('active');
    authEls.tabSignIn.setAttribute('aria-selected', 'false');
    authEls.title.textContent = 'Create New Account';
    authEls.sub.textContent = 'Choose a username and password to protect your playlists.';
    authEls.submitBtn.innerHTML = '<span>Create Account</span>';
  }
}

function openAuth(mode = 'login') {
  setAuthMode(mode);
  authEls.username.value = '';
  authEls.password.value = '';
  authEls.modal.hidden = false;
  setTimeout(() => authEls.username.focus(), 80);
}
function closeAuth() {
  authEls.modal.hidden = true;
}

authEls.openBtn?.addEventListener('click', () => openAuth('login'));
authEls.gateSignIn?.addEventListener('click', () => openAuth('login'));
authEls.gateSignUp?.addEventListener('click', () => openAuth('register'));
authEls.closeBtn?.addEventListener('click', closeAuth);
authEls.tabSignIn?.addEventListener('click', () => setAuthMode('login'));
authEls.tabSignUp?.addEventListener('click', () => setAuthMode('register'));
authEls.modal?.addEventListener('click', (e) => {
  if (e.target === authEls.modal) closeAuth();
});

authEls.form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = authEls.username.value.trim();
  const password = authEls.password.value.trim();
  if (!username || !password) return;

  authEls.errorMsg.hidden = true;
  authEls.submitBtn.disabled = true;
  const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Authentication failed');
    }
    state.user = data.user;
    updateUserUI();
    closeAuth();
    showToast(authMode === 'login' ? `Welcome back, ${data.user.username}!` : `Account created! Welcome, ${data.user.username}`);
    loadPlaylists();
  } catch (err) {
    authEls.errorMsg.textContent = err.message;
    authEls.errorMsg.hidden = false;
  } finally {
    authEls.submitBtn.disabled = false;
  }
});

authEls.logoutBtn?.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  state.user = null;
  state.playlists = [];
  updateUserUI();
  showToast('Signed out');
});

function updateUserUI() {
  if (state.user) {
    authEls.authActions.style.display = 'none';
    authEls.userProfile.style.display = 'inline-flex';
    authEls.displayUsername.textContent = state.user.username;
    authEls.gateCard.style.display = 'none';
    authEls.grid.style.display = 'grid';
    authEls.sectionActions.style.display = 'block';
  } else {
    authEls.authActions.style.display = 'block';
    authEls.userProfile.style.display = 'none';
    authEls.gateCard.style.display = 'block';
    authEls.grid.style.display = 'none';
    authEls.sectionActions.style.display = 'none';
    authEls.grid.innerHTML = '';
  }
}

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.authenticated && data.user) {
      state.user = data.user;
      updateUserUI();
      loadPlaylists();
    } else {
      state.user = null;
      updateUserUI();
    }
  } catch (err) {
    console.error('Failed to verify session:', err);
    state.user = null;
    updateUserUI();
  }
}

/* Playlists Operations */
async function loadPlaylists() {
  if (!state.user) return;
  try {
    const res = await fetch('/api/playlists');
    if (!res.ok) return;
    const data = await res.json();
    state.playlists = data.playlists || [];
    renderPlaylists();
  } catch (err) {
    console.error('Failed to load playlists:', err);
  }
}

function renderPlaylists() {
  authEls.grid.innerHTML = '';
  if (!state.playlists.length) {
    authEls.grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">No playlists yet. Click "+ New Playlist" to create one!</div>';
    return;
  }
  state.playlists.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'playlist-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.innerHTML = `
      <div class="playlist-cover-box">
        ${p.cover ? `<img alt="" src="${esc(p.cover)}" onerror="this.style.display='none'">` : '<div class="pl-fallback">🎵</div>'}
      </div>
      <div class="pl-name">${esc(p.name)}</div>
      <div class="pl-count">${p.track_count} track${p.track_count === 1 ? '' : 's'}</div>
    `;
    card.addEventListener('click', () => openPlaylistDetails(p.id));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlaylistDetails(p.id); }
    });
    authEls.grid.appendChild(card);
  });
}

// Create Playlist
authEls.openNewPlBtn?.addEventListener('click', () => {
  authEls.newPlName.value = '';
  authEls.newPlModal.hidden = false;
  setTimeout(() => authEls.newPlName.focus(), 80);
});
authEls.closeNewPlBtn?.addEventListener('click', () => { authEls.newPlModal.hidden = true; });
authEls.cancelNewPlBtn?.addEventListener('click', () => { authEls.newPlModal.hidden = true; });
authEls.newPlModal?.addEventListener('click', (e) => {
  if (e.target === authEls.newPlModal) authEls.newPlModal.hidden = true;
});

authEls.newPlForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = authEls.newPlName.value.trim();
  if (!name) return;
  try {
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create');
    authEls.newPlModal.hidden = true;
    showToast(`Created playlist "${name}"`);
    loadPlaylists();
  } catch (err) {
    showToast(err.message);
  }
});

// Playlist Details Modal
async function openPlaylistDetails(playlistId) {
  currentViewingPlaylistId = playlistId;
  authEls.detailTracks.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">Loading tracks...</div>';
  authEls.detailModal.hidden = false;

  try {
    const res = await fetch(`/api/playlists/${playlistId}`);
    if (!res.ok) throw new Error('Could not load playlist');
    const data = await res.json();
    const pl = data.playlist;
    const tracks = data.tracks || [];

    authEls.detailName.textContent = pl.name;
    authEls.detailMeta.textContent = `${tracks.length} track${tracks.length === 1 ? '' : 's'}`;

    authEls.playAllBtn.onclick = () => {
      if (!tracks.length) { showToast('Playlist is empty'); return; }
      state.queue = tracks.slice();
      state.currentIdx = 0;
      playCurrent();
      authEls.detailModal.hidden = true;
      showToast(`Playing playlist "${pl.name}"`);
    };

    authEls.deletePlBtn.onclick = async () => {
      if (!confirm(`Are you sure you want to delete "${pl.name}"?`)) return;
      try {
        const dRes = await fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' });
        if (dRes.ok) {
          authEls.detailModal.hidden = true;
          showToast(`Deleted "${pl.name}"`);
          loadPlaylists();
        }
      } catch (e) {
        showToast('Failed to delete playlist');
      }
    };

    authEls.detailTracks.innerHTML = '';
    if (!tracks.length) {
      authEls.detailTracks.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted)">This playlist is empty. Search songs and tap ❤️ to save them here!</div>';
      return;
    }

    tracks.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'pl-track-item';
      row.innerHTML = `
        <img alt="" src="${esc(t.cover)}" onerror="this.style.background='var(--surface)'">
        <div class="pl-meta">
          <div class="pl-title">${esc(t.title)}</div>
          <div class="pl-artist">${esc(t.artist)}${t.duration_ms ? ' · ' + fmt(t.duration_ms / 1000) : ''}</div>
        </div>
        <div class="pl-item-btns">
          <button class="pl-play-btn" title="Play"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
          <button class="pl-del-btn" title="Remove from playlist">&times;</button>
        </div>
      `;
      row.querySelector('.pl-play-btn').addEventListener('click', () => {
        state.queue = tracks.slice();
        state.currentIdx = i;
        playCurrent();
      });
      row.querySelector('.pl-del-btn').addEventListener('click', async () => {
        try {
          const rRes = await fetch(`/api/playlists/${playlistId}/tracks/${t.id}`, { method: 'DELETE' });
          if (rRes.ok) {
            row.remove();
            showToast(`Removed from playlist`);
            openPlaylistDetails(playlistId);
            loadPlaylists();
          }
        } catch (e) {
          showToast('Failed to remove track');
        }
      });
      authEls.detailTracks.appendChild(row);
    });
  } catch (err) {
    authEls.detailTracks.innerHTML = `<div style="padding:20px;text-align:center;color:#ff7e9e">${err.message}</div>`;
  }
}

authEls.closeDetailModal?.addEventListener('click', () => { authEls.detailModal.hidden = true; });
authEls.detailModal?.addEventListener('click', (e) => {
  if (e.target === authEls.detailModal) authEls.detailModal.hidden = true;
});

// Add Track to Playlist Flow
function openAddToPlaylistModal(track) {
  if (!state.user) {
    showToast('Please sign in to save songs to playlists');
    openAuth('login');
    return;
  }
  targetTrackForPlaylist = track;
  authEls.addMeta.textContent = `Save “${track.title}” by ${track.artist}`;
  authEls.addOptions.innerHTML = '';

  if (!state.playlists.length) {
    authEls.addOptions.innerHTML = '<div style="padding:14px;color:var(--muted);text-align:center">No playlists found. Create one below!</div>';
  } else {
    state.playlists.forEach((p) => {
      const btn = document.createElement('button');
      btn.className = 'add-pl-btn';
      btn.innerHTML = `<span>${esc(p.name)}</span> <span class="pl-badge">${p.track_count} tracks</span>`;
      btn.addEventListener('click', async () => {
        try {
          const res = await fetch(`/api/playlists/${p.id}/tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(targetTrackForPlaylist)
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to add');
          authEls.addModal.hidden = true;
          showToast(`Saved to "${p.name}" ❤️`);
          loadPlaylists();
        } catch (err) {
          showToast(err.message);
        }
      });
      authEls.addOptions.appendChild(btn);
    });
  }

  authEls.addModal.hidden = false;
}

authEls.closeAddModal?.addEventListener('click', () => { authEls.addModal.hidden = true; });
authEls.addModal?.addEventListener('click', (e) => {
  if (e.target === authEls.addModal) authEls.addModal.hidden = true;
});
authEls.quickCreateBtn?.addEventListener('click', () => {
  authEls.addModal.hidden = true;
  authEls.openNewPlBtn.click();
});

/* =====================================================================
   Boot
   ===================================================================== */
renderQueue();
loadMoods();
checkAuth();
doSearch('top hits 2025', 'Trending today');

