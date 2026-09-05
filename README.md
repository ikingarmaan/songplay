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
- 📱 **Native Android App (`songplay.apk`)** — standalone, hardware-accelerated Android APK with lock-screen media controls, background playback, and offline catalog
- 🌐 **PWA & Offline Ready** — installable on Android, iOS, Windows, and macOS with Service Worker caching
- 🔒 **Future-Proof Multi-Tier Search** — 4-tier fallback engine (JioSaavn ➔ iTunes ➔ Deezer ➔ Curated offline catalog) with persistent SQLite disk caching
- 🎛️ **MediaSession API Integration** — full lock-screen, Bluetooth headset, and notification shade media controls
- 🎨 **Pro UI/UX** — skeleton loaders, toast feedback, smooth transitions, animated vinyl, equalizer, lyrics, sleep timer

## 📱 Android App (`songplay.apk`)

A dedicated standalone native Android app is provided in the repository root:
- **File:** `songplay.apk`
- **Package:** `com.songplay.app`
- **Supported Android Versions:** Android 5.0 (Lollipop) up to Android 15/16 (API 21 – 36)
- **Features:** Hardware-accelerated WebView, native DES stream decryption, lock screen media session controls, custom fullscreen video/canvas, back button handling, and offline fallback catalog.

To build the APK from source at any time:
```bash
./build_apk.sh
```

## 🏗️ Architecture

```
songplay/
├── songplay.apk          # Standalone release-signed Android APK
├── build_apk.sh          # One-command automated Android build script
├── android/              # Native Android application source & resources
├── app.py                # Flask web service, multi-tier search & stream decryptor
├── requirements.txt      # Python deps (Flask, pycryptodome, requests, etc.)
├── render.yaml           # Render deployment
├── Procfile              # process model
├── templates/
│   └── index.html        # SPA markup
└── static/
    ├── style.css         # design system + glassmorphism components
    ├── app.js            # search, player, queue, mediaSession, PWA
    ├── sw.js             # Service Worker for offline asset & audio caching
    ├── manifest.webmanifest
    └── favicon.svg
```

The multi-tier music engine:
1. **Tier 1 (JioSaavn):** High-bitrate 160kbps AAC full tracks with DES CDN decryption
2. **Tier 2 (iTunes Search):** Comprehensive global catalog fallback
3. **Tier 3 (Deezer API):** Third-party resilient global preview stream fallback
4. **Tier 4 (Offline Curated Catalog):** Built-in curated track catalog ensuring search never fails even completely offline
5. **Persistent SQLite Disk Caching:** Instant zero-network response for previously fetched queries
6. **MediaSession API:** Native lock screen, smartwatch, and Bluetooth playback controls

## 🛠️ Tech

- **Android App:** Native Java + Android SDK, D8, AAPT2, Hardware Accelerated WebView
- **Backend:** Flask 3, gunicorn, requests, flask-caching, pycryptodome / cryptography, SQLite3
- **Frontend:** Vanilla HTML/CSS/JS — no heavy frameworks, Service Worker, Web App Manifest
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
