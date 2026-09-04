// SongPlay — single-page music player powered by the free iTunes Search API.
// 30-second previews stream directly from Apple's CDN. No login, no keys, no CORS issues.

const API = 'https://itunes.apple.com/search?media=music&limit=24';
const audio = document.getElementById('audio');

const els = {
  form: document.getElementById('searchForm'),
  input: document.getElementById('searchInput'),
  results: document.getElementById('results'),
  status: document.getElementById('status'),
  resultsTitle: document.getElementById('resultsTitle'),
  resultsSub: document.getElementById('resultsSub'),
  cover: document.getElementById('cover'),
  nowTitle: document.getElementById('nowTitle'),
  nowArtist: document.getElementById('nowArtist'),
  playBtn: document.getElementById('playBtn'),
  playIcon: document.getElementById('playIcon'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  shuffleBtn: document.getElementById('shuffleBtn'),
  loopBtn: document.getElementById('loopBtn'),
  muteBtn: document.getElementById('muteBtn'),
  volIcon: document.getElementById('volIcon'),
  volume: document.getElementById('volume'),
  volFill: document.getElementById('volFill'),
  progress: document.getElementById('progress'),
  progressFill: document.getElementById('progressFill'),
  progressThumb: document.getElementById('progressThumb'),
  curTime: document.getElementById('curTime'),
  durTime: document.getElementById('durTime'),
  chips: document.getElementById('chips'),
  moodGrid: document.getElementById('moodGrid'),
  queueBtn: document.getElementById('queueBtn'),
  queuePanel: document.getElementById('queuePanel'),
  closeQueue: document.getElementById('closeQueue'),
  queueList: document.getElementById('queueList'),
  toast: document.getElementById('toast'),
  disc: document.querySelector('.disc'),
};

const state = {
  tracks: [],
  queue: [],
  currentIdx: -1,
  isPlaying: false,
  shuffle: false,
  loop: false,
  lastVolume: 0.7,
  audioReady: false,
};

audio.volume = state.lastVolume;
setVolUI(state.lastVolume);

const moods = [
  { name: 'Chill Vibes', q: 'lofi chill', color: 'linear-gradient(135deg,#3ad6ff,#a06bff)', ico: '🌊' },
  { name: 'Romantic',    q: 'love songs', color: 'linear-gradient(135deg,#ff5fa2,#ffb35c)', ico: '💖' },
  { name: 'Workout',     q: 'workout motivation', color: 'linear-gradient(135deg,#ff5e3a,#ffb35c)', ico: '🔥' },
  { name: 'Party',       q: 'party dance', color: 'linear-gradient(135deg,#a06bff,#ff5fa2)', ico: '🎉' },
  { name: 'Bollywood',   q: 'bollywood hits', color: 'linear-gradient(135deg,#ffb35c,#ff5fa2)', ico: '🎬' },
  { name: 'Punjabi',     q: 'punjabi', color: 'linear-gradient(135deg,#3ad6ff,#ff5fa2)', ico: '🪘' },
  { name: 'Hip Hop',     q: 'hip hop', color: 'linear-gradient(135deg,#1a1a2e,#a06bff)', ico: '🎤' },
  { name: 'Focus',       q: 'study focus instrumental', color: 'linear-gradient(135deg,#0f3a4d,#3ad6ff)', ico: '🧠' },
];

moods.forEach(m => {
  const div = document.createElement('div');
  div.className = 'mood';
  div.style.background = m.color;
  div.innerHTML = `<div><span class="ico">${m.ico}</span><span>${m.name}</span></div>`;
  div.addEventListener('click', () => doSearch(m.q, m.name));
  els.moodGrid.appendChild(div);
});

els.chips.addEventListener('click', e => {
  if (e.target.tagName === 'BUTTON') doSearch(e.target.dataset.q, e.target.textContent);
});

els.form.addEventListener('submit', e => {
  e.preventDefault();
  const q = els.input.value.trim();
  if (q) doSearch(q, `"${q}"`);
});

async function doSearch(q, label) {
  els.status.textContent = `Searching ${label}...`;
  els.results.innerHTML = '';
  els.resultsTitle.textContent = label ? `Results for ${label}` : 'Results';
  els.resultsSub.textContent = 'Tap a card to play. Hit + to add to queue.';
  try {
    const res = await fetch(`${API}&term=${encodeURIComponent(q)}`);
    const data = await res.json();
    const tracks = (data.results || [])
      .filter(t => t.previewUrl)
      .map(t => ({
        id: t.trackId,
        title: t.trackName,
        artist: t.artistName,
        album: t.collectionName || '',
        cover: (t.artworkUrl100 || '').replace('100x100bb', '300x300bb'),
        preview: t.previewUrl,
        duration: 30,
      }));
    state.tracks = tracks;
    renderResults(tracks);
    if (!tracks.length) els.status.textContent = 'No previews found. Try another search.';
    else els.status.textContent = `${tracks.length} tracks ready to play.`;
  } catch (err) {
    els.status.textContent = 'Something went wrong. Check your connection.';
  }
}

function renderResults(tracks) {
  els.results.innerHTML = '';
  tracks.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="art">
        <img src="${t.cover}" alt="" loading="lazy" onerror="this.style.display='none'"/>
        <div class="play-overlay"><div class="pp"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div></div>
      </div>
      <button class="add-btn" title="Add to queue">+</button>
      <div class="name">${escapeHTML(t.title)}</div>
      <div class="sub">${escapeHTML(t.artist)}</div>
    `;
    card.querySelector('.art').addEventListener('click', () => playFromResults(i));
    card.querySelector('.add-btn').addEventListener('click', e => {
      e.stopPropagation();
      addToQueue(t);
      showToast(`Added “${t.title}” to queue`);
    });
    els.results.appendChild(card);
  });
}

function playFromResults(i) {
  if (!state.tracks[i]) return;
  // build a queue of remaining tracks so next/prev works naturally
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
    state.audioReady = true;
    updatePlayerUI();
  }).catch(() => {
    state.isPlaying = false;
    updatePlayerUI();
    showToast('Tap play to start audio');
  });
  updatePlayerUI();
}

function updatePlayerUI() {
  const t = state.queue[state.currentIdx];
  if (t) {
    els.nowTitle.textContent = t.title;
    els.nowArtist.textContent = t.artist;
    if (t.cover) {
      els.cover.innerHTML = `<img src="${t.cover}" alt="">`;
    }
    document.title = `${t.title} • ${t.artist} — SongPlay`;
  } else {
    els.nowTitle.textContent = 'Nothing playing';
    els.nowArtist.textContent = 'Search a song to start';
    els.cover.innerHTML = '<div class="cover-fallback">♪</div>';
  }
  els.cover.classList.toggle('playing', state.isPlaying);
  els.disc.classList.toggle('playing', state.isPlaying);
  els.playIcon.innerHTML = state.isPlaying
    ? '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>'
    : '<path d="M8 5v14l11-7z"/>';
  renderQueue();
}

els.playBtn.addEventListener('click', () => {
  if (!state.queue.length) {
    showToast('Search a song first');
    return;
  }
  if (audio.paused) {
    if (audio.src) {
      audio.play();
      state.isPlaying = true;
    } else {
      playCurrent();
    }
  } else {
    audio.pause();
    state.isPlaying = false;
  }
  updatePlayerUI();
});

els.nextBtn.addEventListener('click', nextTrack);
els.prevBtn.addEventListener('click', prevTrack);

function nextTrack() {
  if (!state.queue.length) return;
  if (state.shuffle) {
    state.currentIdx = Math.floor(Math.random() * state.queue.length);
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
  if (state.loop) { audio.play(); return; }
  nextTrack();
});
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  els.progressFill.style.width = pct + '%';
  els.progressThumb.style.left = pct + '%';
  els.curTime.textContent = fmt(audio.currentTime);
  els.durTime.textContent = fmt(audio.duration);
});
audio.addEventListener('loadedmetadata', () => {
  els.durTime.textContent = fmt(audio.duration);
});
audio.addEventListener('play', () => { state.isPlaying = true; updatePlayerUI(); });
audio.addEventListener('pause', () => { state.isPlaying = false; updatePlayerUI(); });

els.progress.addEventListener('click', e => {
  if (!audio.duration) return;
  const rect = els.progress.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  audio.currentTime = ratio * audio.duration;
});

let dragProgress = false;
els.progress.addEventListener('mousedown', e => dragProgress = true);
window.addEventListener('mousemove', e => {
  if (!dragProgress || !audio.duration) return;
  const rect = els.progress.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.currentTime = ratio * audio.duration;
});
window.addEventListener('mouseup', () => dragProgress = false);

els.muteBtn.addEventListener('click', () => {
  if (audio.volume > 0) {
    state.lastVolume = audio.volume;
    audio.volume = 0;
  } else {
    audio.volume = state.lastVolume || 0.7;
  }
  setVolUI(audio.volume);
});
els.volume.addEventListener('click', e => {
  const rect = els.volume.getBoundingClientRect();
  const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.volume = v;
  state.lastVolume = v;
  setVolUI(v);
});
function setVolUI(v) {
  els.volFill.style.width = (v * 100) + '%';
  els.volIcon.innerHTML = v === 0
    ? '<path d="M16.5 12a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zM3 9v6h4l5 5V4L7 9H3z"/><path d="M19 5l-1.4 1.4 2.6 2.6-2.6 2.6L19 13l4-4z" opacity=".7"/>'
    : '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z"/>';
}

function addToQueue(track) {
  if (state.queue.find(t => t.id === track.id)) return;
  state.queue.push(track);
  renderQueue();
}
function renderQueue() {
  if (!els.queueList) return;
  els.queueList.innerHTML = '';
  if (!state.queue.length) {
    els.queueList.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">Queue is empty</div>';
    return;
  }
  state.queue.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'queue-item' + (i === state.currentIdx ? ' active' : '');
    div.innerHTML = `
      <img class="qimg" src="${t.cover}" alt="" onerror="this.style.background='#222'">
      <div class="qmeta">
        <div class="qtitle">${escapeHTML(t.title)}</div>
        <div class="qartist">${escapeHTML(t.artist)}</div>
      </div>
      <button class="qrm" title="Remove">×</button>
    `;
    div.addEventListener('click', e => {
      if (e.target.classList.contains('qrm')) {
        state.queue.splice(i, 1);
        if (i === state.currentIdx) { state.currentIdx = -1; audio.pause(); audio.src = ''; updatePlayerUI(); }
        else if (i < state.currentIdx) state.currentIdx--;
        renderQueue();
        return;
      }
      state.currentIdx = i;
      playCurrent();
    });
    els.queueList.appendChild(div);
  });
}

els.queueBtn.addEventListener('click', () => els.queuePanel.classList.toggle('open'));
els.closeQueue.addEventListener('click', () => els.queuePanel.classList.remove('open'));

// Keyboard shortcuts
window.addEventListener('keydown', e => {
  if (document.activeElement.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); els.playBtn.click(); }
  if (e.code === 'ArrowRight') nextTrack();
  if (e.code === 'ArrowLeft') prevTrack();
  if (e.key === 'm') els.muteBtn.click();
  if (e.key === 'q') els.queueBtn.click();
});

function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
function escapeHTML(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.remove('show'), 1800);
}

// Initial load — show some trending tracks
doSearch('top hits 2025', 'Trending today');
renderQueue();
