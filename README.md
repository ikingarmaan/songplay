# SongPlay 🎧

A single-page music player with a stunning glassmorphism + neon theme. Search any song, artist, or mood and stream 30-second previews instantly. No login. No backend. No keys.

![SongPlay](https://img.shields.io/badge/status-live-brightgreen) ![HTML5](https://img.shields.io/badge/HTML5-orange) ![CSS3](https://img.shields.io/badge/CSS3-blue) ![JS](https://img.shields.io/badge/Vanilla%20JS-yellow)

## Features

- 🔍 **Smart search** — type any song, artist, or mood and get up to 24 matching tracks with album art
- 🎚️ **Full media player** — play/pause, next/prev, shuffle, loop, seekable progress bar, volume slider with mute
- 📀 **Animated vinyl disc** that spins while music plays
- ➕ **Queue panel** — add tracks, reorder by clicking, remove with one click
- 🎭 **Mood presets** — Chill, Romantic, Workout, Party, Bollywood, Punjabi, Hip Hop, Focus
- ⌨️ **Keyboard shortcuts** — `Space` play/pause, `←/→` prev/next, `M` mute, `Q` queue
- 📱 Fully responsive
- ✨ No signup, no API keys, no backend

## Tech

- **HTML5** + **CSS3** (glassmorphism, gradients, animations)
- **Vanilla JavaScript** (no frameworks)
- **iTunes Search API** — Apple's free public API for track metadata + 30-second preview URLs

## Run

Just open `index.html` in any modern browser.

Or serve it locally:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Files

```
songplay/
├── index.html   # markup
├── songplay.css # theme + layout
└── songplay.js  # search, player, queue
```

## How it works

The iTunes Search API (`https://itunes.apple.com/search?media=music`) returns JSON with track metadata and a `previewUrl` for each track. We play those 30-second MP3 previews directly in the browser. No scraping, no auth.

## License

MIT
