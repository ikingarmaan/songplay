"""SongPlay — Flask web service.

Serves the single-page music player and provides full-song streaming
via high-bitrate JioSaavn CDN audio with iTunes search as fallback.
Unlimited playback, no login, free.
"""
from __future__ import annotations

import base64
import html
import json
import logging
import os
import time
import warnings
from typing import Any
from urllib.parse import quote_plus

import requests
from flask import (
    Flask,
    Response,
    jsonify,
    render_template,
    request,
    send_from_directory,
)
from flask_caching import Cache

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SAAVN_ENDPOINT = "https://www.jiosaavn.com/api.php"
SAAVN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}
SAAVN_TIMEOUT = 8

ITUNES_ENDPOINT = "https://itunes.apple.com/search"
ITUNES_TIMEOUT = 8

CACHE_TTL = 60 * 30  # 30 minutes
DEFAULT_LIMIT = 24
MAX_LIMIT = 50

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["CACHE_TYPE"] = "SimpleCache"
app.config["CACHE_DEFAULT_TIMEOUT"] = CACHE_TTL
cache = Cache(app)

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")
log = logging.getLogger("songplay")


# ---------------------------------------------------------------------------
# Decryption & Stream Resolver
# ---------------------------------------------------------------------------
def _decrypt_saavn_media_url(enc: str) -> str | None:
    """Decrypt JioSaavn encrypted_media_url to a playable high-bitrate CDN link."""
    if not enc:
        return None
    try:
        raw = base64.b64decode(enc.strip())
        decrypted_bytes: bytes | None = None

        # 1. Try pycryptodome (standard DES ECB)
        try:
            from Crypto.Cipher import DES

            cipher = DES.new(b"38346591", DES.MODE_ECB)
            decrypted_bytes = cipher.decrypt(raw)
        except ImportError:
            pass

        # 2. Fallback to cryptography TripleDES (k1=k2=k3 is single DES)
        if decrypted_bytes is None:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

                    key = b"38346591" * 3
                    cipher = Cipher(algorithms.TripleDES(key), modes.ECB())
                    decrypted_bytes = cipher.decryptor().update(raw) + cipher.decryptor().finalize()
            except Exception as exc:
                log.warning("cryptography fallback failed: %s", exc)

        if not decrypted_bytes:
            return None

        url = decrypted_bytes.decode("utf-8", errors="ignore").strip()
        if ".mp4" in url:
            url = url.split(".mp4")[0] + ".mp4"
        if not url.startswith("http"):
            return None

        # Upgrade from 96kbps to 160kbps high-quality AAC stream
        return url.replace("_96.mp4", "_160.mp4")
    except Exception as exc:
        log.warning("Failed to decrypt media url: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Helpers & Normalizers
# ---------------------------------------------------------------------------
def _normalize_saavn_track(item: dict[str, Any]) -> dict[str, Any] | None:
    """Map a JioSaavn song object into SongPlay's clean track schema."""
    more_info = item.get("more_info") or {}
    enc_url = more_info.get("encrypted_media_url")
    if not enc_url:
        return None

    stream_url = _decrypt_saavn_media_url(enc_url)
    if not stream_url:
        return None

    title = html.unescape(item.get("title") or item.get("song") or "Unknown").strip()

    # Determine artist
    artist = ""
    artist_map = more_info.get("artistMap")
    if isinstance(artist_map, dict):
        primary = artist_map.get("primary_artists") or []
        if primary and isinstance(primary, list) and isinstance(primary[0], dict):
            artist = ", ".join(p.get("name", "") for p in primary if p.get("name"))
    if not artist:
        artist = html.unescape(item.get("subtitle") or more_info.get("music") or "Unknown").strip()

    album = html.unescape(more_info.get("album") or "").strip()

    # Crisp 500x500 album art
    raw_img = item.get("image") or ""
    cover = raw_img.replace("150x150", "500x500").replace("50x50", "500x500")

    # Track duration (full song in seconds -> ms)
    try:
        dur_sec = int(more_info.get("duration") or 0)
    except (ValueError, TypeError):
        dur_sec = 0
    dur_ms = (dur_sec * 1000) if dur_sec > 0 else 180000

    release = str(item.get("year") or more_info.get("release_date") or "")
    genre = str(more_info.get("language") or "")

    return {
        "id": f"saavn_{item.get('id')}",
        "title": title,
        "artist": artist,
        "album": album,
        "cover": cover,
        "preview": stream_url,  # Direct full-song streaming URL
        "duration_ms": dur_ms,
        "release": release,
        "genre": genre,
        "is_full": True,
    }


def _normalize_itunes_track(item: dict[str, Any]) -> dict[str, Any] | None:
    """Map an iTunes result row into our clean public schema (fallback)."""
    preview = item.get("previewUrl")
    if not preview:
        return None
    cover = (item.get("artworkUrl100") or "").replace("100x100bb", "300x300bb")
    return {
        "id": f"itunes_{item.get('trackId')}",
        "title": html.unescape(item.get("trackName") or "Unknown"),
        "artist": html.unescape(item.get("artistName") or "Unknown"),
        "album": html.unescape(item.get("collectionName") or ""),
        "cover": cover,
        "preview": preview,
        "duration_ms": item.get("trackTimeMillis") or 30000,
        "release": item.get("releaseDate") or "",
        "genre": item.get("primaryGenreName") or "",
        "is_full": False,
    }


def _fetch_saavn(term: str, limit: int) -> list[dict[str, Any]]:
    """Query JioSaavn API for full songs."""
    params = {
        "__call": "search.getResults",
        "_format": "json",
        "_marker": "0",
        "api_version": "4",
        "ctx": "web6dot0",
        "p": "1",
        "q": term,
        "n": limit,
    }
    try:
        r = requests.get(SAAVN_ENDPOINT, params=params, headers=SAAVN_HEADERS, timeout=SAAVN_TIMEOUT)
        r.raise_for_status()
        data = r.json()
    except Exception as exc:
        log.warning("JioSaavn search failed for %r: %s", term, exc)
        return []

    out: list[dict[str, Any]] = []
    for raw in data.get("results", []):
        norm = _normalize_saavn_track(raw)
        if norm:
            out.append(norm)
    return out


def _fetch_itunes(term: str, limit: int) -> list[dict[str, Any]]:
    """Query iTunes Search API as fallback."""
    params = {"media": "music", "entity": "song", "term": term, "limit": limit}
    try:
        r = requests.get(ITUNES_ENDPOINT, params=params, timeout=ITUNES_TIMEOUT)
        r.raise_for_status()
        data = r.json()
    except (requests.RequestException, ValueError) as exc:
        log.warning("iTunes request failed for %r: %s", term, exc)
        return []
    out: list[dict[str, Any]] = []
    for raw in data.get("results", []):
        norm = _normalize_itunes_track(raw)
        if norm:
            out.append(norm)
    return out


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/")
def index() -> str:
    return render_template("index.html")


@app.get("/favicon.ico")
def favicon() -> Response:
    return send_from_directory(app.static_folder, "favicon.svg", mimetype="image/svg+xml")


@app.get("/healthz")
def healthz() -> Response:
    return jsonify({"status": "ok", "ts": int(time.time())})


@app.get("/api/search")
def api_search() -> Response:
    term = (request.args.get("q") or "").strip()
    if not term:
        return jsonify({"error": "missing query parameter 'q'"}), 400
    if len(term) > 120:
        return jsonify({"error": "query too long"}), 400

    try:
        limit = int(request.args.get("limit", DEFAULT_LIMIT))
    except ValueError:
        limit = DEFAULT_LIMIT
    limit = max(1, min(limit, MAX_LIMIT))

    cache_key = f"search:{quote_plus(term.lower())}:{limit}"
    cached = cache.get(cache_key)
    if cached is not None:
        return jsonify({"query": term, "count": len(cached), "results": cached, "cached": True})

    # Search Saavn first for full songs
    results = _fetch_saavn(term, limit)
    # If no results found, fall back to iTunes
    if not results:
        results = _fetch_itunes(term, limit)

    cache.set(cache_key, results)
    return jsonify({"query": term, "count": len(results), "results": results, "cached": False})


@app.get("/api/suggest")
def api_suggest() -> Response:
    """Returns curated mood/genre packs for the front-end."""
    packs = [
        {"id": "trending", "name": "Trending Today",   "q": "top hits 2025",            "icon": "🔥", "color": "linear-gradient(135deg,#ff5e3a,#ffb35c)"},
        {"id": "chill",    "name": "Chill Vibes",      "q": "lofi chill",               "icon": "🌊", "color": "linear-gradient(135deg,#3ad6ff,#a06bff)"},
        {"id": "romantic", "name": "Romantic",         "q": "love songs",               "icon": "💖", "color": "linear-gradient(135deg,#ff5fa2,#ffb35c)"},
        {"id": "workout",  "name": "Workout Energy",   "q": "workout motivation",       "icon": "💪", "color": "linear-gradient(135deg,#ff5e3a,#a06bff)"},
        {"id": "party",    "name": "Party Anthems",    "q": "party dance",              "icon": "🎉", "color": "linear-gradient(135deg,#a06bff,#ff5fa2)"},
        {"id": "bolly",    "name": "Bollywood Hits",   "q": "bollywood hits",           "icon": "🎬", "color": "linear-gradient(135deg,#ffb35c,#ff5fa2)"},
        {"id": "punjabi",  "name": "Punjabi Beats",    "q": "punjabi hits",             "icon": "🪘", "color": "linear-gradient(135deg,#3ad6ff,#ff5fa2)"},
        {"id": "focus",    "name": "Deep Focus",       "q": "instrumental focus",       "icon": "🧠", "color": "linear-gradient(135deg,#0f3a4d,#3ad6ff)"},
        {"id": "hiphop",   "name": "Hip Hop",          "q": "hip hop rap",              "icon": "🎤", "color": "linear-gradient(135deg,#1a1a2e,#a06bff)"},
        {"id": "rock",     "name": "Rock Classics",    "q": "rock classics",            "icon": "🎸", "color": "linear-gradient(135deg,#a06bff,#0f3a4d)"},
        {"id": "edm",      "name": "EDM Drops",        "q": "edm festival",             "icon": "⚡", "color": "linear-gradient(135deg,#3ad6ff,#a06bff)"},
        {"id": "sleep",    "name": "Sleep Sounds",     "q": "sleep calm ambient",       "icon": "🌙", "color": "linear-gradient(135deg,#1a1a2e,#3ad6ff)"},
    ]
    return jsonify({"packs": packs})



# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------
@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not found"}), 404
    return render_template("index.html"), 200  # SPA fallback


@app.errorhandler(500)
def server_error(e):
    log.exception("server error: %s", e)
    return jsonify({"error": "internal server error"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
