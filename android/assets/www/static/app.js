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
  fullscreenBtn: $('fullscreenBtn'),
  playerSaveBtn: $('playerSaveBtn'),
  radioBtn: $('radioBtn'),
  eqBtn: $('eqBtn'),
  sleepTimerBtn: $('sleepTimerBtn'),
  sleepBadge: $('sleepBadge'),
  shareBtn: $('shareBtn'),
  shortcutsBtn: $('shortcutsBtn'),
  recentlyPlayed: $('recentlyPlayed'),
  recentList: $('recentList'),
  clearRecentBtn: $('clearRecentBtn'),
  clearQueueBtn: $('clearQueueBtn'),
  autoplayToggle: $('autoplayToggle'),
};

const fsEls = {
  container: $('fullscreenPlayer'),
  canvas: $('fsDynamicCanvas'),
  backdrop: $('fsBackdrop'),
  closeBtn: $('closeFullscreenBtn'),
  saveBtn: $('fsSaveBtn'),
  viewArtBtn: $('fsViewArtBtn'),
  viewLyricsBtn: $('fsViewLyricsBtn'),
  visualFxBtn: $('fsVisualFxBtn'),
  radioBtn: $('fsRadioBtn'),
  eqBtn: $('fsEqBtn'),
  sleepTimerBtn: $('fsSleepTimerBtn'),
  shareBtn: $('fsShareBtn'),
  queueBtn: $('fsQueueBtn'),
  stage: $('fsStage'),
  artWrapper: $('fsArtWrapper'),
  art: $('fsArt'),
  coverImg: $('fsCoverImg'),
  fallback: $('fsFallback'),
  lyricsWrapper: $('fsLyricsWrapper'),
  lyricsStatus: $('fsLyricsStatus'),
  lyricsScroller: $('fsLyricsScroller'),
  title: $('fsTitle'),
  artist: $('fsArtist'),
  curTime: $('fsCurTime'),
  durTime: $('fsDurTime'),
  progress: $('fsProgress'),
  progressFill: $('fsProgressFill'),
  progressThumb: $('fsProgressThumb'),
  shuffleBtn: $('fsShuffleBtn'),
  prevBtn: $('fsPrevBtn'),
  playBtn: $('fsPlayBtn'),
  playIcon: $('fsPlayIcon'),
  nextBtn: $('fsNextBtn'),
  loopBtn: $('fsLoopBtn'),
  muteBtn: $('fsMuteBtn'),
  volIcon: $('fsVolIcon'),
  volume: $('fsVolume'),
  volFill: $('fsVolFill'),
  nativeBtn: $('fsNativeBtn'),
};

const eqEls = {
  modal: $('eqModal'),
  closeBtn: $('closeEqModal'),
  doneBtn: $('doneEqBtn'),
  resetBtn: $('resetEqBtn'),
  presets: $('eqPresets'),
  spatialToggle: $('spatialAudioToggle'),
  bass: $('eqBass'),
  bassVal: $('eqBassVal'),
  mid: $('eqMid'),
  midVal: $('eqMidVal'),
  treble: $('eqTreble'),
  trebleVal: $('eqTrebleVal'),
  speedChips: $('eqSpeedChips'),
};

const sleepEls = {
  modal: $('sleepTimerModal'),
  closeBtn: $('closeSleepModal'),
  status: $('sleepModalStatus'),
  options: $('sleepOptions'),
  offBtn: $('sleepOffBtn'),
};

const shortcutEls = {
  modal: $('shortcutsModal'),
  closeBtn: $('closeShortcutsModal'),
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
  autoplay: true,
  sleepTimer: {
    active: false,
    remainingSeconds: 0,
    endOfTrack: false,
    intervalId: null,
    targetTimestamp: null,
    originalVolume: 0.7,
  },
  eq: {
    preset: 'flat',
    bass: 0,
    mid: 0,
    treble: 0,
    spatial: false,
    speed: 1.0,
  },
  lyrics: {
    trackId: null,
    loading: false,
    found: false,
    synced: false,
    lines: [],
    currentLineIdx: -1,
    activeView: 'art', // 'art' | 'lyrics'
  },
  visualFx: {
    mode: 0, // 0: Aurora Glow Mesh, 1: Flowing Waves, 2: Cosmic Starlight
    colors: ['#a78bfa', '#ff5fa2', '#3ad6ff'],
    running: false,
    animId: null,
  },
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
    card.addEventListener('click', (e) => {
      if (e.target.closest('.save-btn') || e.target.closest('.add-btn')) return;
      playFromResults(i);
    });
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
   MediaSession API (Lock screen, Android notification widget, Bluetooth)
   ===================================================================== */
function updateMediaSession(t) {
  if (!('mediaSession' in navigator) || !t) return;
  try {
    const artwork = [];
    if (t.cover) {
      artwork.push(
        { src: t.cover, sizes: '96x96',   type: 'image/jpeg' },
        { src: t.cover, sizes: '192x192', type: 'image/jpeg' },
        { src: t.cover, sizes: '512x512', type: 'image/jpeg' }
      );
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title || 'Unknown Title',
      artist: t.artist || 'Unknown Artist',
      album: t.album || 'SongPlay',
      artwork: artwork
    });
  } catch (e) {}
}

function initMediaSessionHandlers() {
  if (!('mediaSession' in navigator)) return;
  const actions = [
    ['play', () => { if (audio.paused) { if (audio.src) audio.play(); else playCurrent(); } }],
    ['pause', () => { audio.pause(); }],
    ['previoustrack', () => { prevTrack(); }],
    ['nexttrack', () => { nextTrack(); }],
    ['seekbackward', (details) => { audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10)); }],
    ['seekforward', (details) => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (details.seekOffset || 10)); }],
    ['seekto', (details) => { if (details.seekTime != null) audio.currentTime = details.seekTime; }],
    ['stop', () => { audio.pause(); audio.currentTime = 0; }]
  ];
  for (const [action, handler] of actions) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch (e) {}
  }
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
  if (typeof initWebAudio === 'function') initWebAudio();
  if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  audio.playbackRate = state.eq.speed || 1.0;
  audio.src = t.preview;
  audio.play().then(() => {
    state.isPlaying = true;
    updatePlayerUI();
  }).catch(() => {
    state.isPlaying = false;
    updatePlayerUI();
  });
  updatePlayerUI();
  updateMediaSession(t);
  if (typeof addToRecentlyPlayed === 'function') addToRecentlyPlayed(t);
  if (typeof fetchLyricsForTrack === 'function') fetchLyricsForTrack(t);
  if (typeof extractColorsFromCover === 'function') extractColorsFromCover(t.cover);
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
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
  }
  highlightCurrentCard();
  renderQueue();
  if (typeof updateFullscreenUI === 'function') updateFullscreenUI();
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

audio.addEventListener('ended', () => {
  if (state.sleepTimer && state.sleepTimer.active && state.sleepTimer.endOfTrack) {
    audio.pause();
    if (typeof cancelSleepTimer === 'function') cancelSleepTimer(false);
    showToast('Sleep timer reached end of song. Goodnight! 🌙');
    return;
  }
  if (state.loop) { audio.play(); return; }
  if (state.autoplay && state.currentIdx >= state.queue.length - 1) {
    if (typeof triggerAutoplayAdvance === 'function') {
      triggerAutoplayAdvance();
      return;
    }
  }
  nextTrack();
});
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  els.progressFill.style.width = pct + '%';
  els.progressThumb.style.left = pct + '%';
  els.progress.setAttribute('aria-valuenow', String(Math.round(pct)));
  els.curTime.textContent = fmt(audio.currentTime);
  els.durTime.textContent = fmt(audio.duration);
  if (typeof updateFullscreenTime === 'function') updateFullscreenTime();
  if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && !isNaN(audio.duration) && audio.duration > 0) {
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(audio.currentTime, audio.duration)
      });
    } catch (e) {}
  }
});
audio.addEventListener('loadedmetadata', () => {
  els.durTime.textContent = fmt(audio.duration);
  if (typeof updateFullscreenTime === 'function') updateFullscreenTime();
});
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
  if (typeof setFsVolUI === 'function') setFsVolUI(v);
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

if (els.clearQueueBtn) {
  els.clearQueueBtn.addEventListener('click', () => {
    state.queue = [];
    state.currentIdx = -1;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    updatePlayerUI();
    showToast('Queue cleared');
  });
}

if (els.autoplayToggle) {
  els.autoplayToggle.addEventListener('change', () => {
    state.autoplay = els.autoplayToggle.checked;
    showToast(state.autoplay ? 'Autoplay similar tracks enabled ✨' : 'Autoplay disabled');
  });
}

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
   Keyboard Shortcuts (Spotify & Apple Music Web Style)
   ===================================================================== */
window.addEventListener('keydown', (e) => {
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;

  if (e.code === 'Space') {
    e.preventDefault();
    els.playBtn.click();
  }
  else if (e.shiftKey && e.code === 'ArrowRight') {
    if (audio.duration) {
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
      showToast('+5s ⏩');
    }
  }
  else if (e.shiftKey && e.code === 'ArrowLeft') {
    if (audio.duration) {
      audio.currentTime = Math.max(0, audio.currentTime - 5);
      showToast('-5s ⏪');
    }
  }
  else if (e.code === 'ArrowRight') {
    nextTrack();
  }
  else if (e.code === 'ArrowLeft') {
    prevTrack();
  }
  else if (e.key === 'm' || e.key === 'M') {
    els.muteBtn.click();
  }
  else if (e.key === 'q' || e.key === 'Q') {
    els.queueBtn.click();
  }
  else if (e.key === 'e' || e.key === 'E') {
    if (eqEls.modal) eqEls.modal.hidden = !eqEls.modal.hidden;
  }
  else if (e.key === 's' || e.key === 'S') {
    if (sleepEls.modal) sleepEls.modal.hidden = !sleepEls.modal.hidden;
  }
  else if (e.key === 'r' || e.key === 'R') {
    if (typeof startRadioForTrack === 'function') startRadioForTrack();
  }
  else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
    if (shortcutEls.modal) shortcutEls.modal.hidden = !shortcutEls.modal.hidden;
  }
  else if (e.key === 'Escape') {
    if (shortcutEls.modal && !shortcutEls.modal.hidden) shortcutEls.modal.hidden = true;
    else if (eqEls.modal && !eqEls.modal.hidden) eqEls.modal.hidden = true;
    else if (sleepEls.modal && !sleepEls.modal.hidden) sleepEls.modal.hidden = true;
    else if (authEls.modal && !authEls.modal.hidden) closeAuth();
    else if (authEls.newPlModal && !authEls.newPlModal.hidden) authEls.newPlModal.hidden = true;
    else if (authEls.detailModal && !authEls.detailModal.hidden) authEls.detailModal.hidden = true;
    else if (authEls.addModal && !authEls.addModal.hidden) authEls.addModal.hidden = true;
    else if (els.queue && els.queue.classList.contains('open')) closeQueue();
    else if (fsEls.container && !fsEls.container.hidden) closeFullscreenPlayer();
  }
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
   Spotify & Apple Music Feature Suite:
   1. Web Audio Equalizer, Speed & Spatial Audio
   2. Sleep Timer with Smooth Volume Fade
   3. Smart Infinite Station / Radio & Autoplay
   4. Recently Played Shelf (Local-First Listening History)
   5. 1-Click Track Sharing & Deep Linking
   6. Keyboard Shortcuts Modal & Event Handlers
   ===================================================================== */

/* 1. Web Audio Equalizer & Spatial Audio Engine */
let audioCtx = null;
let sourceNode = null;
let bassNode = null;
let midNode = null;
let trebleNode = null;
let webAudioReady = false;

function initWebAudio() {
  if (webAudioReady) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioCtx = new AudioContextClass();

    audio.crossOrigin = 'anonymous';
    sourceNode = audioCtx.createMediaElementSource(audio);

    // 150 Hz Lowshelf filter
    bassNode = audioCtx.createBiquadFilter();
    bassNode.type = 'lowshelf';
    bassNode.frequency.value = 150;
    bassNode.gain.value = state.eq.bass;

    // 1000 Hz Peaking filter
    midNode = audioCtx.createBiquadFilter();
    midNode.type = 'peaking';
    midNode.frequency.value = 1000;
    midNode.Q.value = 1.0;
    midNode.gain.value = state.eq.mid;

    // 3500 Hz Highshelf filter
    trebleNode = audioCtx.createBiquadFilter();
    trebleNode.type = 'highshelf';
    trebleNode.frequency.value = 3500;
    trebleNode.gain.value = state.eq.treble;

    // Connect source -> bass -> mid -> treble -> destination
    sourceNode.connect(bassNode);
    bassNode.connect(midNode);
    midNode.connect(trebleNode);
    trebleNode.connect(audioCtx.destination);

    webAudioReady = true;
  } catch (err) {
    console.warn('Web Audio API not supported or CORS restricted; using standard playback:', err);
    webAudioReady = false;
  }
}

const EQ_PRESETS = {
  flat:       { bass: 0,  mid: 0,  treble: 0,  spatial: false },
  bass:       { bass: 8,  mid: -1, treble: 2,  spatial: false },
  vocal:      { bass: -2, mid: 5,  treble: 4,  spatial: false },
  electronic: { bass: 7,  mid: 1,  treble: 5,  spatial: false },
  rock:       { bass: 5,  mid: 3,  treble: 4,  spatial: false },
  acoustic:   { bass: 2,  mid: 4,  treble: 2,  spatial: false },
};

function applyEqPreset(name) {
  const p = EQ_PRESETS[name];
  if (!p) return;
  state.eq.preset = name;
  state.eq.bass = p.bass;
  state.eq.mid = p.mid;
  state.eq.treble = p.treble;
  state.eq.spatial = p.spatial;
  applyEqValues();

  document.querySelectorAll('.eq-chip').forEach(b => {
    b.classList.toggle('active', b.dataset.preset === name);
  });
}

function applyEqValues() {
  if (bassNode) bassNode.gain.value = state.eq.bass;
  if (midNode) midNode.gain.value = state.eq.mid;
  if (trebleNode) trebleNode.gain.value = state.eq.treble;

  if (eqEls.bass) eqEls.bass.value = state.eq.bass;
  if (eqEls.bassVal) eqEls.bassVal.textContent = (state.eq.bass > 0 ? '+' : '') + state.eq.bass + ' dB';
  if (eqEls.mid) eqEls.mid.value = state.eq.mid;
  if (eqEls.midVal) eqEls.midVal.textContent = (state.eq.mid > 0 ? '+' : '') + state.eq.mid + ' dB';
  if (eqEls.treble) eqEls.treble.value = state.eq.treble;
  if (eqEls.trebleVal) eqEls.trebleVal.textContent = (state.eq.treble > 0 ? '+' : '') + state.eq.treble + ' dB';

  if (eqEls.spatialToggle) eqEls.spatialToggle.checked = state.eq.spatial;
  if (audio) audio.playbackRate = state.eq.speed || 1.0;
}

function setPlaybackSpeed(spd) {
  state.eq.speed = spd;
  if (audio) audio.playbackRate = spd;
  document.querySelectorAll('.speed-chip').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.speed) === spd);
  });
  showToast(`Speed set to ${spd}x`);
}

// Wire Equalizer UI elements
if (eqEls.presets) {
  eqEls.presets.addEventListener('click', (e) => {
    const btn = e.target.closest('.eq-chip');
    if (btn && btn.dataset.preset) applyEqPreset(btn.dataset.preset);
  });
}

if (eqEls.bass) {
  eqEls.bass.addEventListener('input', (e) => {
    state.eq.bass = Number(e.target.value);
    applyEqValues();
  });
}
if (eqEls.mid) {
  eqEls.mid.addEventListener('input', (e) => {
    state.eq.mid = Number(e.target.value);
    applyEqValues();
  });
}
if (eqEls.treble) {
  eqEls.treble.addEventListener('input', (e) => {
    state.eq.treble = Number(e.target.value);
    applyEqValues();
  });
}

if (eqEls.spatialToggle) {
  eqEls.spatialToggle.addEventListener('change', () => {
    state.eq.spatial = eqEls.spatialToggle.checked;
    if (state.eq.spatial) {
      state.eq.bass = Math.min(12, state.eq.bass + 3);
      state.eq.treble = Math.min(12, state.eq.treble + 3);
    } else {
      state.eq.bass = Math.max(-12, state.eq.bass - 3);
      state.eq.treble = Math.max(-12, state.eq.treble - 3);
    }
    applyEqValues();
    showToast(state.eq.spatial ? 'Spatial Audio Active 🎧' : 'Spatial Audio Off');
  });
}

if (eqEls.speedChips) {
  eqEls.speedChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.speed-chip');
    if (chip && chip.dataset.speed) {
      setPlaybackSpeed(Number(chip.dataset.speed));
    }
  });
}

if (eqEls.resetBtn) {
  eqEls.resetBtn.addEventListener('click', () => {
    applyEqPreset('flat');
    setPlaybackSpeed(1.0);
    showToast('Equalizer reset to Flat');
  });
}

if (eqEls.closeBtn) eqEls.closeBtn.addEventListener('click', () => { eqEls.modal.hidden = true; });
if (eqEls.doneBtn) eqEls.doneBtn.addEventListener('click', () => { eqEls.modal.hidden = true; });
if (els.eqBtn) els.eqBtn.addEventListener('click', () => {
  initWebAudio();
  eqEls.modal.hidden = false;
});
if (fsEls.eqBtn) fsEls.eqBtn.addEventListener('click', () => {
  initWebAudio();
  eqEls.modal.hidden = false;
});


/* 2. Sleep Timer with Smooth Volume Fade */
function setSleepTimer(minutes, endOfTrack = false) {
  cancelSleepTimer(false);

  if (endOfTrack) {
    state.sleepTimer.active = true;
    state.sleepTimer.endOfTrack = true;
    state.sleepTimer.remainingSeconds = 0;
    updateSleepUI();
    showToast('Sleep timer set for end of current song 🌙');
    if (sleepEls.modal) sleepEls.modal.hidden = true;
    return;
  }

  const secs = minutes * 60;
  state.sleepTimer.active = true;
  state.sleepTimer.endOfTrack = false;
  state.sleepTimer.remainingSeconds = secs;
  state.sleepTimer.targetTimestamp = Date.now() + (secs * 1000);
  state.sleepTimer.originalVolume = audio.volume || state.lastVolume || 0.7;

  updateSleepUI();
  showToast(`Sleep timer set for ${minutes} minutes 🌙`);
  if (sleepEls.modal) sleepEls.modal.hidden = true;

  state.sleepTimer.intervalId = setInterval(() => {
    const remaining = Math.max(0, Math.round((state.sleepTimer.targetTimestamp - Date.now()) / 1000));
    state.sleepTimer.remainingSeconds = remaining;
    updateSleepUI();

    // Smooth volume fade-out over last 15 seconds
    if (remaining <= 15 && remaining > 0) {
      const frac = remaining / 15;
      audio.volume = state.sleepTimer.originalVolume * frac;
      setVolUI(audio.volume);
    }

    if (remaining <= 0) {
      clearInterval(state.sleepTimer.intervalId);
      state.sleepTimer.intervalId = null;
      audio.pause();
      audio.volume = state.sleepTimer.originalVolume;
      setVolUI(audio.volume);
      cancelSleepTimer(false);
      showToast('Sleep timer reached. Goodnight! 🌙');
    }
  }, 1000);
}

function cancelSleepTimer(showNotice = true) {
  if (state.sleepTimer.intervalId) {
    clearInterval(state.sleepTimer.intervalId);
    state.sleepTimer.intervalId = null;
  }
  if (state.sleepTimer.originalVolume && audio) {
    audio.volume = state.sleepTimer.originalVolume;
    setVolUI(audio.volume);
  }
  state.sleepTimer.active = false;
  state.sleepTimer.endOfTrack = false;
  state.sleepTimer.remainingSeconds = 0;
  state.sleepTimer.targetTimestamp = null;
  updateSleepUI();
  if (showNotice) showToast('Sleep timer turned off');
}

function updateSleepUI() {
  if (!els.sleepBadge) return;
  if (!state.sleepTimer.active) {
    els.sleepBadge.hidden = true;
    els.sleepBadge.textContent = '';
    if (sleepEls.offBtn) sleepEls.offBtn.hidden = true;
    if (sleepEls.status) sleepEls.status.textContent = 'Stops music gently so you can rest';
    document.querySelectorAll('.sleep-btn').forEach(b => b.classList.remove('active'));
    return;
  }

  els.sleepBadge.hidden = false;
  if (sleepEls.offBtn) sleepEls.offBtn.hidden = false;

  if (state.sleepTimer.endOfTrack) {
    els.sleepBadge.textContent = '1x';
    if (sleepEls.status) sleepEls.status.textContent = 'Active: Pauses when current song ends 🌙';
    document.querySelectorAll('.sleep-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.time === 'end');
    });
  } else {
    const mins = Math.ceil(state.sleepTimer.remainingSeconds / 60);
    els.sleepBadge.textContent = `${mins}m`;
    const m = Math.floor(state.sleepTimer.remainingSeconds / 60);
    const s = state.sleepTimer.remainingSeconds % 60;
    const timeStr = `${m}:${String(s).padStart(2, '0')}`;
    if (sleepEls.status) sleepEls.status.textContent = `Active: ${timeStr} remaining 🌙`;
    document.querySelectorAll('.sleep-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.time) === Math.round(mins));
    });
  }
}

if (sleepEls.options) {
  sleepEls.options.addEventListener('click', (e) => {
    const btn = e.target.closest('.sleep-btn');
    if (!btn) return;
    const val = btn.dataset.time;
    if (val === '0') {
      cancelSleepTimer();
      sleepEls.modal.hidden = true;
    } else if (val === 'end') {
      setSleepTimer(0, true);
    } else {
      setSleepTimer(Number(val), false);
    }
  });
}

if (sleepEls.closeBtn) sleepEls.closeBtn.addEventListener('click', () => { sleepEls.modal.hidden = true; });
if (els.sleepTimerBtn) els.sleepTimerBtn.addEventListener('click', () => { sleepEls.modal.hidden = false; });
if (fsEls.sleepTimerBtn) fsEls.sleepTimerBtn.addEventListener('click', () => { sleepEls.modal.hidden = false; });


/* 3. Smart Infinite Station / Radio & Autoplay */
async function startRadioForTrack(seedTrack) {
  if (!seedTrack) seedTrack = state.queue[state.currentIdx];
  if (!seedTrack) {
    showToast('Play or search a song first to start radio 📻');
    return;
  }

  showToast(`Tuning into ${seedTrack.artist} station... 📻`);
  try {
    const res = await fetch(`${API}/radio?title=${encodeURIComponent(seedTrack.title)}&artist=${encodeURIComponent(seedTrack.artist)}&genre=${encodeURIComponent(seedTrack.genre || '')}&track_id=${encodeURIComponent(seedTrack.id || '')}`);
    if (!res.ok) throw new Error('Station currently unavailable');
    const data = await res.json();
    const tracks = data.results || [];
    if (!tracks.length) throw new Error('No similar tracks found');

    state.queue = [seedTrack, ...tracks];
    state.currentIdx = 0;
    playCurrent();
    showToast(`Radio started! Added ${tracks.length} tracks to station 📻`);
  } catch (err) {
    showToast(err.message || 'Radio error');
  }
}

async function triggerAutoplayAdvance() {
  const current = state.queue[state.currentIdx];
  if (!current) return nextTrack();
  try {
    const res = await fetch(`${API}/radio?title=${encodeURIComponent(current.title)}&artist=${encodeURIComponent(current.artist)}&genre=${encodeURIComponent(current.genre || '')}&track_id=${encodeURIComponent(current.id || '')}`);
    if (!res.ok) return nextTrack();
    const data = await res.json();
    const fresh = (data.results || []).filter(t => !state.queue.some(q => q.id === t.id));
    if (fresh.length > 0) {
      state.queue.push(...fresh);
      renderQueue();
      state.currentIdx++;
      playCurrent();
      showToast('Autoplay queued similar tracks ✨');
    } else {
      nextTrack();
    }
  } catch {
    nextTrack();
  }
}

if (els.radioBtn) els.radioBtn.addEventListener('click', () => startRadioForTrack());
if (fsEls.radioBtn) fsEls.radioBtn.addEventListener('click', () => startRadioForTrack());


/* 4. Recently Played Shelf (Local-First Listening History) */
const RECENT_STORAGE_KEY = 'songplay_recently_played_v1';

function getRecentlyPlayed() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function addToRecentlyPlayed(track) {
  if (!track || !track.title) return;
  let list = getRecentlyPlayed();
  list = list.filter(t => t.id !== track.id && !(t.title === track.title && t.artist === track.artist));
  list.unshift({ ...track, playedAt: Date.now() });
  if (list.length > 20) list = list.slice(0, 20);
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(list));
  } catch {}
  renderRecentlyPlayed();
}

function renderRecentlyPlayed() {
  const list = getRecentlyPlayed();
  if (!list.length) {
    if (els.recentlyPlayed) els.recentlyPlayed.hidden = true;
    return;
  }
  if (els.recentlyPlayed) els.recentlyPlayed.hidden = false;
  if (!els.recentList) return;

  els.recentList.innerHTML = '';
  list.forEach((t) => {
    const card = document.createElement('div');
    card.className = 'recent-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.innerHTML = `
      <div class="recent-art">
        <img loading="lazy" alt="" src="${esc(t.cover)}" onerror="this.style.display='none'">
        <div class="play-overlay"><div class="pp">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div></div>
      </div>
      <div class="name">${esc(t.title)}</div>
      <div class="sub">${esc(t.artist)}</div>
      <div class="time-ago">${formatTimeAgo(t.playedAt)}</div>
    `;
    card.addEventListener('click', () => {
      state.queue = [t, ...state.queue.filter(x => x.id !== t.id)];
      state.currentIdx = 0;
      playCurrent();
    });
    els.recentList.appendChild(card);
  });
}

function formatTimeAgo(ts) {
  if (!ts) return 'Recent';
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

if (els.clearRecentBtn) {
  els.clearRecentBtn.addEventListener('click', () => {
    localStorage.removeItem(RECENT_STORAGE_KEY);
    renderRecentlyPlayed();
    showToast('Cleared listening history');
  });
}


/* 5. 1-Click Track Sharing & Deep Linking */
function shareTrack(track) {
  if (!track) track = state.queue[state.currentIdx];
  if (!track) {
    showToast('Play a song first to share');
    return;
  }
  const shareUrl = `${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(track.title + ' ' + track.artist)}&play=1`;
  if (navigator.share) {
    navigator.share({
      title: `${track.title} • ${track.artist}`,
      text: `Listen to "${track.title}" by ${track.artist} on SongPlay`,
      url: shareUrl,
    }).catch(() => {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast(`Copied link for "${track.title}"! 🔗`);
    }).catch(() => {
      showToast('Unable to copy link');
    });
  } else {
    prompt('Copy song link:', shareUrl);
  }
}

if (els.shareBtn) els.shareBtn.addEventListener('click', () => shareTrack());
if (fsEls.shareBtn) fsEls.shareBtn.addEventListener('click', () => shareTrack());

function handleDeepLinking() {
  const params = new URLSearchParams(window.location.search);
  const q = (params.get('q') || '').trim();
  const autoPlay = params.get('play') === '1';

  if (q) {
    els.input.value = q;
    doSearch(q, `"${q}"`).then(() => {
      if (autoPlay && state.tracks && state.tracks.length > 0) {
        state.queue = state.tracks.slice();
        state.currentIdx = 0;
        playCurrent();
      }
    });
  }
}


/* 6. Keyboard Shortcuts Modal */
if (els.shortcutsBtn) els.shortcutsBtn.addEventListener('click', () => { shortcutEls.modal.hidden = false; });
if (shortcutEls.closeBtn) shortcutEls.closeBtn.addEventListener('click', () => { shortcutEls.modal.hidden = true; });

/* =====================================================================
   Auth & Playlists with Resilient Local-First Auto-Sync
   ===================================================================== */
let authMode = 'login';
let targetTrackForPlaylist = null;
let currentViewingPlaylistId = null;

const LOCAL_STORAGE_ACCOUNT_KEY = 'songplay_saved_account_v1';

function getStoredAccount() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_ACCOUNT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveLocalAccount(user, passwordCred = null) {
  if (!user || !user.username) return;
  try {
    const prev = getStoredAccount() || {};
    const payload = {
      username: user.username,
      user_token: user.user_token || prev.user_token || '',
      password_cred: passwordCred !== null ? passwordCred : (prev.password_cred || ''),
      playlists: state.playlists && state.playlists.length > 0 ? state.playlists : (prev.playlists || []),
      last_active: Date.now()
    };
    localStorage.setItem(LOCAL_STORAGE_ACCOUNT_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Could not save account to localStorage:', e);
  }
}

function clearLocalAccount() {
  try {
    localStorage.removeItem(LOCAL_STORAGE_ACCOUNT_KEY);
  } catch (e) {}
}

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
  rememberMe: $('authRememberMe'),
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
  quickNewPlForm: $('quickNewPlaylistForm'),
  quickNewPlInput: $('quickNewPlaylistInput'),
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
  const saved = getStoredAccount();
  if (saved && saved.username) {
    authEls.username.value = saved.username;
    if (saved.password_cred) {
      authEls.password.value = saved.password_cred;
    } else {
      authEls.password.value = '';
    }
  } else {
    authEls.username.value = '';
    authEls.password.value = '';
  }
  authEls.modal.hidden = false;
  setTimeout(() => {
    if (authEls.username.value) {
      authEls.password.focus();
    } else {
      authEls.username.focus();
    }
  }, 80);
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
    const payload = { username, password };
    if (authMode === 'login') {
      const stored = getStoredAccount();
      if (stored) {
        payload.clientBackup = stored;
      }
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Authentication failed');
    }
    state.user = data.user;
    const shouldRemember = authEls.rememberMe ? authEls.rememberMe.checked : true;
    if (shouldRemember) {
      saveLocalAccount(data.user, password);
    }
    updateUserUI();
    closeAuth();
    if (data.restored) {
      showToast(`Welcome back, ${data.user.username}! Account & playlists restored.`);
    } else {
      showToast(authMode === 'login' ? `Welcome back, ${data.user.username}!` : `Account created! Welcome, ${data.user.username}`);
    }
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
  clearLocalAccount();
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
      await loadPlaylists();
      saveLocalAccount(data.user);
      return;
    }
  } catch (err) {
    console.warn('Session check failed, trying auto-restore:', err);
  }

  // If server session is unauthenticated (e.g. cloud container redeploy / browser restart),
  // check if this device has saved credentials / token / playlists in localStorage
  const saved = getStoredAccount();
  if (saved && saved.username && (saved.user_token || saved.password_cred)) {
    try {
      const syncRes = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: saved.username,
          password_cred: saved.password_cred,
          user_token: saved.user_token,
          playlists: saved.playlists || []
        })
      });
      const syncData = await syncRes.json();
      if (syncRes.ok && syncData.authenticated && syncData.user) {
        state.user = syncData.user;
        updateUserUI();
        await loadPlaylists();
        saveLocalAccount(syncData.user);
        if (syncData.restored) {
          showToast(`Welcome back, ${syncData.user.username}! Your playlists were recovered.`);
        }
        return;
      }
    } catch (syncErr) {
      console.error('Auto-login sync error:', syncErr);
    }
  }

  state.user = null;
  updateUserUI();
}

/* Playlists Operations */
async function loadPlaylists() {
  if (!state.user) return;
  try {
    const res = await fetch('/api/playlists?include_tracks=1');
    if (!res.ok) throw new Error('Failed to fetch playlists');
    const data = await res.json();
    state.playlists = data.playlists || [];
    renderPlaylists();
    saveLocalAccount(state.user);
  } catch (err) {
    console.error('Failed to load playlists:', err);
    // Offline / redeploy fallback: populate from local backup if available
    const saved = getStoredAccount();
    if (saved && saved.playlists && saved.playlists.length > 0 && (!state.playlists || state.playlists.length === 0)) {
      state.playlists = saved.playlists;
      renderPlaylists();
    }
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
  const submitBtn = authEls.newPlForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
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
  } finally {
    if (submitBtn) submitBtn.disabled = false;
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
    authEls.detailTracks.innerHTML = `<div style="padding:20px;text-align:center;color:#ff7e9e">${esc(err.message)}</div>`;
  }
}

authEls.closeDetailModal?.addEventListener('click', () => { authEls.detailModal.hidden = true; });
authEls.detailModal?.addEventListener('click', (e) => {
  if (e.target === authEls.detailModal) authEls.detailModal.hidden = true;
});

// Add Track to Playlist Flow
async function openAddToPlaylistModal(track) {
  if (!state.user) {
    showToast('Please sign in to save songs to playlists');
    openAuth('login');
    return;
  }
  targetTrackForPlaylist = track;
  authEls.addMeta.textContent = `Save “${track.title}” by ${track.artist}`;
  authEls.addOptions.innerHTML = '<div style="padding:14px;color:var(--muted);text-align:center">Loading playlists...</div>';
  authEls.addModal.hidden = false;

  await loadPlaylists();

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
}

authEls.closeAddModal?.addEventListener('click', () => { authEls.addModal.hidden = true; });
authEls.addModal?.addEventListener('click', (e) => {
  if (e.target === authEls.addModal) authEls.addModal.hidden = true;
});

// Inline Quick Create & Save in Add-to-Playlist Modal
authEls.quickNewPlForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = authEls.quickNewPlInput.value.trim();
  if (!name || !targetTrackForPlaylist) return;
  const submitBtn = authEls.quickNewPlForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create playlist');

    const newPlId = data.playlist.id;
    const saveRes = await fetch(`/api/playlists/${newPlId}/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(targetTrackForPlaylist)
    });
    const saveData = await saveRes.json();
    if (!saveRes.ok) throw new Error(saveData.error || 'Failed to save track');

    authEls.quickNewPlInput.value = '';
    authEls.addModal.hidden = true;
    showToast(`Created "${name}" & saved song ❤️`);
    loadPlaylists();
  } catch (err) {
    showToast(err.message);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

/* =====================================================================
   Fullscreen Player, Dynamic Effects & Synced Lyrics
   ===================================================================== */

/* Dynamic Color Extraction from Album Cover */
function extractColorsFromCover(coverUrl) {
  if (!coverUrl) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const cv = document.createElement('canvas');
      cv.width = 40; cv.height = 40;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 40, 40);
      const data = ctx.getImageData(0, 0, 40, 40).data;
      let r1 = 0, g1 = 0, b1 = 0, count1 = 0;
      let r2 = 0, g2 = 0, b2 = 0, count2 = 0;
      for (let i = 0; i < data.length; i += 16) {
        const pr = data[i], pg = data[i + 1], pb = data[i + 2];
        const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
        if (lum > 35 && lum < 230) {
          if (i % 32 === 0) { r1 += pr; g1 += pg; b1 += pb; count1++; }
          else { r2 += pr; g2 += pg; b2 += pb; count2++; }
        }
      }
      if (count1 > 0) {
        const c1 = `rgb(${Math.round(r1 / count1)}, ${Math.round(g1 / count1)}, ${Math.round(b1 / count1)})`;
        const c2 = count2 > 0
          ? `rgb(${Math.round(r2 / count2)}, ${Math.round(g2 / count2)}, ${Math.round(b2 / count2)})`
          : '#ff5fa2';
        state.visualFx.colors = [c1, c2, '#a78bfa'];
      }
    } catch (err) {
      // Keep default vivid palette
    }
  };
  img.src = coverUrl;
}

/* Dynamic Background Canvas Visualizer Engine */
let canvasCtx = null;
let canvasWidth = 0;
let canvasHeight = 0;

function resizeDynamicCanvas() {
  if (!fsEls.canvas) return;
  canvasWidth = fsEls.canvas.width = window.innerWidth;
  canvasHeight = fsEls.canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeDynamicCanvas);

function startDynamicCanvas() {
  if (!fsEls.canvas) return;
  resizeDynamicCanvas();
  canvasCtx = fsEls.canvas.getContext('2d');
  if (state.visualFx.running) return;
  state.visualFx.running = true;
  renderDynamicCanvas();
}

function stopDynamicCanvas() {
  state.visualFx.running = false;
  if (state.visualFx.animId) {
    cancelAnimationFrame(state.visualFx.animId);
    state.visualFx.animId = null;
  }
}

function renderDynamicCanvas() {
  if (!state.visualFx.running || !canvasCtx || !fsEls.container || fsEls.container.hidden) {
    state.visualFx.running = false;
    return;
  }

  const ctx = canvasCtx;
  const w = canvasWidth;
  const h = canvasHeight;
  const t = performance.now() * 0.001;
  const isPlaying = state.isPlaying;
  const colors = state.visualFx.colors || ['#a78bfa', '#ff5fa2', '#3ad6ff'];
  const mode = state.visualFx.mode;

  ctx.clearRect(0, 0, w, h);

  // Audio-beat expansion factor
  const pulse = isPlaying ? (1 + 0.08 * Math.sin(t * 3.5)) : 1.0;

  if (mode === 0) {
    // Mode 0: Aurora Glow Mesh (Smooth fluid breathing orbs)
    const orbs = [
      { x: w * 0.3 + Math.sin(t * 0.5) * (w * 0.2), y: h * 0.35 + Math.cos(t * 0.4) * (h * 0.15), r: Math.min(w, h) * 0.48 * pulse, c: colors[0] },
      { x: w * 0.72 + Math.cos(t * 0.4) * (w * 0.2), y: h * 0.62 + Math.sin(t * 0.6) * (h * 0.18), r: Math.min(w, h) * 0.52 * pulse, c: colors[1] || colors[0] },
      { x: w * 0.5 + Math.sin(t * 0.3) * (w * 0.25), y: h * 0.78 + Math.cos(t * 0.5) * (h * 0.15), r: Math.min(w, h) * 0.42 * pulse, c: colors[2] || colors[0] },
    ];

    orbs.forEach(orb => {
      const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r);
      grad.addColorStop(0, orb.c);
      grad.addColorStop(0.5, orb.c.replace('rgb', 'rgba').replace(')', ', 0.35)'));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
      ctx.fill();
    });

  } else if (mode === 1) {
    // Mode 1: Flowing Ripple Waves
    const waveCount = 3;
    for (let i = 0; i < waveCount; i++) {
      ctx.beginPath();
      ctx.moveTo(0, h);
      const baseH = h * 0.68 + i * 45;
      const speed = isPlaying ? (t * (1.6 + i * 0.4)) : (t * 0.4);
      const freq = 0.003 + i * 0.0012;
      const amp = (32 + i * 18) * (isPlaying ? 1.4 : 0.65);

      for (let x = 0; x <= w; x += 14) {
        const y = baseH + Math.sin(x * freq + speed) * amp + Math.cos(x * freq * 0.5 + speed * 0.8) * (amp * 0.4);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();

      const col = colors[i % colors.length];
      const grad = ctx.createLinearGradient(0, baseH - amp, 0, h);
      grad.addColorStop(0, col.replace('rgb', 'rgba').replace(')', ', 0.32)'));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fill();
    }

  } else {
    // Mode 2: Cosmic Starlight Particle Drift
    const count = 38;
    for (let i = 0; i < count; i++) {
      const px = ((Math.sin(i * 99 + t * 0.2) * 0.5 + 0.5) * w);
      const py = ((h - (t * (isPlaying ? 45 : 15) * (1 + (i % 3) * 0.4) + i * 50) % h));
      const size = (3 + (i % 4) * 3) * (isPlaying ? (1 + 0.2 * Math.sin(t * 3 + i)) : 1);
      const col = colors[i % colors.length];

      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  state.visualFx.animId = requestAnimationFrame(renderDynamicCanvas);
}

// Switch Visualizer Mode on Button Tap
fsEls.visualFxBtn?.addEventListener('click', () => {
  state.visualFx.mode = (state.visualFx.mode + 1) % 3;
  const names = ['Aurora Glow Mesh', 'Flowing Wave Ripple', 'Cosmic Starlight'];
  showToast(`Dynamic Effect: ${names[state.visualFx.mode]}`);
});

/* =====================================================================
   Lyrics Controller (Auto-Detect, Auto-Sync & Click-to-Seek)
   ===================================================================== */
let currentLyricsAbort = null;

async function fetchLyricsForTrack(track) {
  if (!track || !track.title) return;
  if (state.lyrics.trackId === track.id && (state.lyrics.found || !state.lyrics.loading)) return;

  if (currentLyricsAbort) currentLyricsAbort.abort();
  const ctrl = new AbortController();
  currentLyricsAbort = ctrl;

  state.lyrics.trackId = track.id;
  state.lyrics.loading = true;
  state.lyrics.found = false;
  state.lyrics.synced = false;
  state.lyrics.lines = [];
  state.lyrics.currentLineIdx = -1;

  if (fsEls.lyricsStatus) {
    fsEls.lyricsStatus.textContent = `Auto-detecting lyrics for "${track.title}"...`;
    fsEls.lyricsStatus.style.display = 'block';
  }
  if (fsEls.lyricsScroller) {
    fsEls.lyricsScroller.innerHTML = '';
    fsEls.lyricsScroller.style.display = 'none';
  }

  try {
    const dur = track.duration_ms ? Math.round(track.duration_ms / 1000) : 0;
    const url = `/api/lyrics?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}&duration=${dur}`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('Lyrics fetch failed');
    const data = await res.json();

    state.lyrics.loading = false;
    if (data.found) {
      state.lyrics.found = true;
      state.lyrics.synced = !!data.synced;
      state.lyrics.lines = data.lines || [];

      if (data.synced && data.lines && data.lines.length) {
        if (fsEls.lyricsStatus) fsEls.lyricsStatus.style.display = 'none';
        if (fsEls.lyricsScroller) {
          fsEls.lyricsScroller.style.display = 'flex';
          renderSyncedLyrics(data.lines);
        }
      } else if (data.plain) {
        if (fsEls.lyricsStatus) fsEls.lyricsStatus.style.display = 'none';
        if (fsEls.lyricsScroller) {
          fsEls.lyricsScroller.style.display = 'block';
          fsEls.lyricsScroller.innerHTML = `<div class="fs-plain-lyrics">${esc(data.plain)}</div>`;
        }
      } else {
        if (fsEls.lyricsStatus) {
          fsEls.lyricsStatus.textContent = 'Lyrics format not supported for this track.';
          fsEls.lyricsStatus.style.display = 'block';
        }
      }
    } else {
      if (fsEls.lyricsStatus) {
        fsEls.lyricsStatus.textContent = 'No lyrics found for this song.';
        fsEls.lyricsStatus.style.display = 'block';
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    state.lyrics.loading = false;
    if (fsEls.lyricsStatus) {
      fsEls.lyricsStatus.textContent = 'Could not load lyrics for this track.';
      fsEls.lyricsStatus.style.display = 'block';
    }
  }
}

function renderSyncedLyrics(lines) {
  if (!fsEls.lyricsScroller) return;
  fsEls.lyricsScroller.innerHTML = '';
  const frag = document.createDocumentFragment();

  lines.forEach((line) => {
    const div = document.createElement('div');
    div.className = 'fs-lyric-line';
    div.textContent = line.text || '♪';
    div.dataset.time = line.time;
    div.addEventListener('click', () => {
      audio.currentTime = line.time;
      if (audio.paused) audio.play();
    });
    frag.appendChild(div);
  });

  fsEls.lyricsScroller.appendChild(frag);
}

function setFsView(view) {
  state.lyrics.activeView = view;
  const isArt = view === 'art';
  fsEls.viewArtBtn?.classList.toggle('active', isArt);
  fsEls.viewArtBtn?.setAttribute('aria-selected', String(isArt));
  fsEls.viewLyricsBtn?.classList.toggle('active', !isArt);
  fsEls.viewLyricsBtn?.setAttribute('aria-selected', String(!isArt));
  if (fsEls.artWrapper) fsEls.artWrapper.hidden = !isArt;
  if (fsEls.lyricsWrapper) fsEls.lyricsWrapper.hidden = isArt;

  if (!isArt && state.lyrics.currentLineIdx >= 0) {
    const activeEl = fsEls.lyricsScroller?.querySelector('.fs-lyric-line.active');
    if (activeEl) {
      setTimeout(() => activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    }
  }
}

fsEls.viewArtBtn?.addEventListener('click', () => setFsView('art'));
fsEls.viewLyricsBtn?.addEventListener('click', () => setFsView('lyrics'));

/* =====================================================================
   Fullscreen View Orchestration
   ===================================================================== */
function openFullscreenPlayer() {
  const t = state.queue[state.currentIdx];
  if (!t) {
    showToast('Play a song to view in fullscreen');
    return;
  }
  fsEls.container.hidden = false;
  updateFullscreenUI();
  updateFullscreenTime();
  startDynamicCanvas();
}

function closeFullscreenPlayer() {
  fsEls.container.hidden = true;
  stopDynamicCanvas();
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

function updateFullscreenUI() {
  if (!fsEls.container || fsEls.container.hidden) return;
  const t = state.queue[state.currentIdx];
  if (t) {
    fsEls.title.textContent = t.title;
    fsEls.artist.textContent = t.artist + (t.album ? ` · ${t.album}` : '');
    if (t.cover) {
      fsEls.coverImg.src = t.cover;
      fsEls.coverImg.style.display = 'block';
      fsEls.fallback.style.display = 'none';
      fsEls.backdrop.style.backgroundImage = `url("${t.cover}")`;
      extractColorsFromCover(t.cover);
    } else {
      fsEls.coverImg.style.display = 'none';
      fsEls.fallback.style.display = 'block';
      fsEls.backdrop.style.backgroundImage = 'none';
    }
    fetchLyricsForTrack(t);
  } else {
    fsEls.title.textContent = 'Nothing playing';
    fsEls.artist.textContent = 'Search a song to begin';
    fsEls.coverImg.style.display = 'none';
    fsEls.fallback.style.display = 'block';
    fsEls.backdrop.style.backgroundImage = 'none';
  }

  fsEls.container.classList.toggle('playing', state.isPlaying);
  fsEls.playIcon.innerHTML = state.isPlaying
    ? '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>'
    : '<path d="M8 5v14l11-7z"/>';

  fsEls.shuffleBtn?.classList.toggle('active', state.shuffle);
  fsEls.loopBtn?.classList.toggle('active', state.loop);
  setFsVolUI(audio.volume);
  if (!state.visualFx.running) {
    startDynamicCanvas();
  }
}

function updateFullscreenTime() {
  if (!fsEls.container || fsEls.container.hidden || !audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  fsEls.progressFill.style.width = pct + '%';
  fsEls.progressThumb.style.left = pct + '%';
  fsEls.progress.setAttribute('aria-valuenow', String(Math.round(pct)));
  fsEls.curTime.textContent = fmt(audio.currentTime);
  fsEls.durTime.textContent = fmt(audio.duration);

  // Synchronized Lyrics Scroller & Line Highlighting
  if (state.lyrics.synced && state.lyrics.lines.length && fsEls.lyricsScroller) {
    const cur = audio.currentTime;
    let activeIdx = -1;
    const lines = state.lyrics.lines;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= cur + 0.2) {
        activeIdx = i;
      } else {
        break;
      }
    }
    if (activeIdx !== state.lyrics.currentLineIdx) {
      state.lyrics.currentLineIdx = activeIdx;
      const lineEls = fsEls.lyricsScroller.querySelectorAll('.fs-lyric-line');
      lineEls.forEach((el, i) => {
        const isActive = i === activeIdx;
        el.classList.toggle('active', isActive);
        if (isActive && state.lyrics.activeView === 'lyrics') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
  }
}

/* Fullscreen seek */
function seekFromFsEvent(e) {
  if (!audio.duration) return;
  const rect = fsEls.progress.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.currentTime = ratio * audio.duration;
  updateFullscreenTime();
}
let draggingFsProgress = false;
fsEls.progress?.addEventListener('mousedown', (e) => { draggingFsProgress = true; seekFromFsEvent(e); });
window.addEventListener('mousemove', (e) => { if (draggingFsProgress) seekFromFsEvent(e); });
window.addEventListener('mouseup', () => { draggingFsProgress = false; });
fsEls.progress?.addEventListener('touchstart', (e) => seekFromFsEvent(e.touches[0]), { passive: true });
fsEls.progress?.addEventListener('touchmove', (e) => seekFromFsEvent(e.touches[0]), { passive: true });
fsEls.progress?.addEventListener('keydown', (e) => {
  if (!audio.duration) return;
  if (e.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); }
  if (e.key === 'ArrowLeft')  { audio.currentTime = Math.max(0, audio.currentTime - 5); }
});

/* Fullscreen volume */
function setFsVolUI(v) {
  if (!fsEls.volFill) return;
  fsEls.volFill.style.width = (v * 100) + '%';
  fsEls.volume.setAttribute('aria-valuenow', String(Math.round(v * 100)));
  fsEls.volIcon.innerHTML = v === 0
    ? '<path d="M16.5 12a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zM3 9v6h4l5 5V4L7 9H3z"/><path d="M19 5l-1.4 1.4 2.6 2.6-2.6 2.6L19 13l4-4z" opacity=".7"/>'
    : '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z"/>';
}
function setFsVolFromEvent(e) {
  const rect = fsEls.volume.getBoundingClientRect();
  const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.volume = v;
  state.lastVolume = v;
  setVolUI(v);
}
fsEls.volume?.addEventListener('click', setFsVolFromEvent);
let draggingFsVol = false;
fsEls.volume?.addEventListener('mousedown', (e) => { draggingFsVol = true; setFsVolFromEvent(e); });
window.addEventListener('mousemove', (e) => { if (draggingFsVol) setFsVolFromEvent(e); });
window.addEventListener('mouseup', () => { draggingFsVol = false; });
fsEls.muteBtn?.addEventListener('click', () => els.muteBtn.click());

/* Fullscreen playback controls */
fsEls.playBtn?.addEventListener('click', () => els.playBtn.click());
fsEls.nextBtn?.addEventListener('click', nextTrack);
fsEls.prevBtn?.addEventListener('click', prevTrack);
fsEls.shuffleBtn?.addEventListener('click', () => els.shuffleBtn.click());
fsEls.loopBtn?.addEventListener('click', () => els.loopBtn.click());

/* Fullscreen triggers & buttons */
els.fullscreenBtn?.addEventListener('click', openFullscreenPlayer);
els.cover?.addEventListener('click', openFullscreenPlayer);
fsEls.closeBtn?.addEventListener('click', closeFullscreenPlayer);
fsEls.queueBtn?.addEventListener('click', () => {
  if (els.queue && els.queue.classList.contains('open')) closeQueue();
  else openQueue();
});

/* Fullscreen & player bar save button */
function handleSaveCurrentSong() {
  const cur = state.queue[state.currentIdx];
  if (!cur) {
    showToast('Play a song first to save it');
    return;
  }
  openAddToPlaylistModal(cur);
}
els.playerSaveBtn?.addEventListener('click', handleSaveCurrentSong);
fsEls.saveBtn?.addEventListener('click', handleSaveCurrentSong);

/* Native browser fullscreen */
function toggleNativeFullscreen() {
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
  if (!isFs) {
    const target = document.documentElement;
    const req = target.requestFullscreen || target.webkitRequestFullscreen || target.mozRequestFullScreen || target.msRequestFullscreen;
    if (req) {
      req.call(target).catch(() => {
        if (fsEls.container?.requestFullscreen) fsEls.container.requestFullscreen().catch(() => {});
      });
    }
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    if (exit) {
      exit.call(document).catch(() => {});
    }
  }
}
fsEls.nativeBtn?.addEventListener('click', toggleNativeFullscreen);

/* Top-layer portal resilience for native fullscreen */
function handleFullscreenChange() {
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
  const fsTarget = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;

  // Update OS Fullscreen button state and label
  if (fsEls.nativeBtn) {
    fsEls.nativeBtn.innerHTML = isFs
      ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg><span>Exit OS Fullscreen</span>'
      : '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg><span>OS Fullscreen</span>';
    fsEls.nativeBtn.classList.toggle('active', isFs);
  }

  // If a sub-element (like fsEls.container) is in fullscreen top-layer,
  // move all modals, queue, scrim, and toast inside it so they are not hidden
  const overlays = document.querySelectorAll('.modal-backdrop, #queue, #scrim, #toast');
  if (fsTarget && fsTarget !== document.documentElement && fsTarget !== document.body) {
    overlays.forEach(el => {
      if (!fsTarget.contains(el)) {
        el._originalParent = el.parentNode;
        fsTarget.appendChild(el);
      }
    });
  } else {
    // Restore overlays to document.body when not in sub-element fullscreen
    overlays.forEach(el => {
      if (el._originalParent && el._originalParent !== el.parentNode) {
        el._originalParent.appendChild(el);
        delete el._originalParent;
      }
    });
  }
}
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);

/* Keyboard shortcut: F for fullscreen */
window.addEventListener('keydown', (e) => {
  const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea') return;

  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    if (fsEls.container.hidden) {
      openFullscreenPlayer();
    } else {
      closeFullscreenPlayer();
    }
  }
});

/* =====================================================================
   Boot
   ===================================================================== */
initMediaSessionHandlers();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('[SongPlay] ServiceWorker active:', reg.scope);
      })
      .catch(err => {
        console.warn('[SongPlay] ServiceWorker registration error:', err);
      });
  });
}

renderQueue();
loadMoods();
checkAuth();
renderRecentlyPlayed();
applyEqValues();
handleDeepLinking();
const urlParams = new URLSearchParams(window.location.search);
if (!urlParams.get('q')) {
  doSearch('top hits 2025', 'Trending today');
}

