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
      <button class="add-btn" aria-label="Add to queue" title="Add to queue">+</button>
      <div class="name">${esc(t.title)}</div>
      <div class="sub">${esc(t.artist)}${t.album ? ' · ' + esc(t.album) : ''}</div>
    `;
    card.querySelector('.art').addEventListener('click', () => playFromResults(i));
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
   Boot
   ===================================================================== */
renderQueue();
loadMoods();
doSearch('top hits 2025', 'Trending today');
