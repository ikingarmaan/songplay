# SongPlay 🎧

> **Developed by Mohd Armaan**

A single-page music player with a polished glassmorphism + neon theme. Search any song, artist, or mood and stream **full songs for free with unlimited playback**. **No login. No tracking. No nonsense.**

![Status](https://img.shields.io/badge/status-live-brightgreen) ![Python](https://img.shields.io/badge/Python-3.11+-blue) ![Flask](https://img.shields.io/badge/Flask-3.0-green) ![License](https://img.shields.io/badge/license-MIT-purple)


## ✨ Features

- 🎵 **Full songs for free** — unlimited streaming of complete tracks in crystal-clear high bitrate (160kbps AAC audio)
- 🔐 **Password-Protected User Accounts** — Sign in or create an account with your desired password to secure your playlists
- 📁 **Custom Playlists** — Create unlimited private playlists, save tracks with one click, and stream full playlists with "Play All"
- 🔍 **Smart search** — type any song, artist, or mood and get matching tracks with high-res 500x500 album art
- 🎚️ **Full media player** — play/pause, next/prev, shuffle, loop, seekable progress bar, volume slider with mute
- 📀 **Animated vinyl disc** that spins while music plays
- ➕ **Queue panel** — add/remove tracks, jump to any track with one click
- 🎭 **12 mood presets** — Chill, Romantic, Workout, Party, Bollywood, Punjabi, Hip Hop, EDM, Focus, Sleep, Rock, Trending
- ⌨️ **Keyboard shortcuts** — `Space` play/pause, `←/→` prev/next, `M` mute, `Q` queue, `Esc` close
- 🌗 **Light + dark themes** (auto-saved)
- 📱 Fully responsive
- 💾 **Server-side caching** (30 min) for faster repeated searches
- ♿ Accessibility — ARIA labels, focus states, skip link, keyboard navigation, reduced-motion support
- 🎨 **Pro UI/UX** — skeleton loaders, toast feedback, smooth transitions, animated vinyl, equalizer

## 🏗️ Architecture

```
songplay/
├── app.py                # Flask web service & stream decryptor
├── requirements.txt      # Python deps (Flask, pycryptodome, requests, etc.)
├── render.yaml           # Render deployment
├── Procfile              # process model
├── runtime.txt           # Python version
├── templates/
│   └── index.html        # SPA markup
└── static/
    ├── style.css         # design system + components
    ├── app.js            # search, player, queue
    └── favicon.svg
```

The Flask backend:
1. Resolves high-fidelity full tracks via JioSaavn's public CDN audio streams
2. Decrypts CDN media streams on the fly to direct seekable AAC streams
3. Provides fallback to iTunes for comprehensive global catalog coverage
4. Caches results in-memory for 30 minutes for instantaneous repeat queries
5. Exposes curated mood packs via `/api/suggest`

## 🛠️ Tech

- **Backend:** Flask 3, gunicorn, requests, flask-caching, pycryptodome / cryptography
- **Frontend:** Vanilla HTML/CSS/JS — no frameworks, no build step
- **Audio:** High-bitrate 160kbps AAC streaming with instant seek support
- **Fonts:** Inter + Space Grotesk (Google Fonts)

## 🚀 Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
# open http://localhost:8000
```

Or with gunicorn:

```bash
gunicorn app:app --bind 0.0.0.0:8000 --workers 2
```

## ☁️ Deploy to Render

1. Push this repo to GitHub (already done)
2. Render Dashboard → **New +** → **Web Service**
3. Connect the `songplay` repo
4. Render auto-detects `render.yaml`, OR fill in:
   - **Environment:** `Python`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 60`
5. Click **Deploy** → live in ~60 seconds 🎉

Health check: `/healthz`

## ⌨️ Keyboard

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `→` | Next track |
| `←` | Previous track (or restart if >3s in) |
| `M` | Mute / unmute |
| `Q` | Toggle queue |
| `Esc` | Close queue |
| `Enter` on a card | Play that track |

## 🔌 API

- `GET /api/search?q=<term>&limit=<n>` — search tracks
- `GET /api/suggest` — curated mood packs
- `GET /healthz` — health check

## ⚖️ Legal Disclaimer & Fair Use

SongPlay is an open-source personal project developed by **Mohd Armaan** for **educational, learning, and research purposes only**. 

- **No Media Hosting**: This repository and application do not host, store, cache, upload, or own any audio files or copyrighted music recordings.
- **Third-Party Indexing**: All streaming links and metadata are dynamically indexed in real time from public third-party endpoints.
- **Copyright Ownership**: All music, lyrics, artist names, and album artwork belong exclusively to their respective record labels, publishers, and artists.
- **DMCA / Takedowns**: If you are a copyright holder and wish to request removal of indexation, please open an issue or refer to [DISCLAIMER.md](DISCLAIMER.md) for our rapid compliance process.

See [DISCLAIMER.md](DISCLAIMER.md) for full legal terms.

## 📝 License

Distributed under the [MIT License](LICENSE). Copyright (c) 2026 **Mohd Armaan**.
