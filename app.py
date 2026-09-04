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
import sqlite3
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
    session,
)
from flask_caching import Cache
from werkzeug.security import check_password_hash, generate_password_hash

# ---------------------------------------------------------------------------
# Config & Database
# ---------------------------------------------------------------------------
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "songplay.db")

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
app.secret_key = os.environ.get("SECRET_KEY", "songplay-session-key-dev-2026")
app.config["CACHE_TYPE"] = "SimpleCache"
app.config["CACHE_DEFAULT_TIMEOUT"] = CACHE_TTL
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
cache = Cache(app)

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")
log = logging.getLogger("songplay")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS playlist_tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_id INTEGER NOT NULL,
                track_id TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT DEFAULT '',
                cover TEXT DEFAULT '',
                preview TEXT NOT NULL,
                duration_ms INTEGER DEFAULT 180000,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
            )
        """)
        conn.commit()


init_db()


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
# Auth Helpers & Endpoints
# ---------------------------------------------------------------------------
def get_current_user() -> dict[str, Any] | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    try:
        with get_db() as conn:
            user = conn.execute("SELECT id, username, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
            if user:
                return dict(user)
    except Exception as exc:
        log.warning("get_current_user error: %s", exc)
    return None


@app.post("/api/auth/register")
def api_register() -> Response:
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or len(username) < 2:
        return jsonify({"error": "Username must be at least 2 characters"}), 400
    if len(username) > 30:
        return jsonify({"error": "Username must be under 30 characters"}), 400
    if not password or len(password) < 4:
        return jsonify({"error": "Password must be at least 4 characters"}), 400

    password_hash = generate_password_hash(password)
    try:
        with get_db() as conn:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, password_hash)
            )
            user_id = cur.lastrowid
            # Create a default "Favorites" playlist for new users
            conn.execute("INSERT INTO playlists (user_id, name) VALUES (?, ?)", (user_id, "Favorites"))
            conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Username is already taken"}), 409

    session["user_id"] = user_id
    session["username"] = username
    return jsonify({"status": "ok", "user": {"id": user_id, "username": username}})


@app.post("/api/auth/login")
def api_login() -> Response:
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"error": "Please enter both username and password"}), 400

    with get_db() as conn:
        user = conn.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (username,)).fetchone()
        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Invalid username or password"}), 401

        session["user_id"] = user["id"]
        session["username"] = user["username"]
        return jsonify({"status": "ok", "user": {"id": user["id"], "username": user["username"]}})


@app.post("/api/auth/logout")
def api_logout() -> Response:
    session.clear()
    return jsonify({"status": "ok"})


@app.get("/api/auth/me")
def api_me() -> Response:
    user = get_current_user()
    if not user:
        return jsonify({"authenticated": False, "user": None})
    return jsonify({"authenticated": True, "user": user})


# ---------------------------------------------------------------------------
# Playlist Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/playlists")
def api_get_playlists() -> Response:
    user = get_current_user()
    if not user:
        return jsonify({"error": "Sign in to access your playlists"}), 401

    with get_db() as conn:
        rows = conn.execute("""
            SELECT p.id, p.name, p.created_at,
                   COUNT(t.id) AS track_count,
                   (SELECT cover FROM playlist_tracks WHERE playlist_id = p.id ORDER BY id ASC LIMIT 1) AS cover
            FROM playlists p
            LEFT JOIN playlist_tracks t ON p.id = t.playlist_id
            WHERE p.user_id = ?
            GROUP BY p.id
            ORDER BY p.id ASC
        """, (user["id"],)).fetchall()
        return jsonify({"playlists": [dict(r) for r in rows]})


@app.post("/api/playlists")
def api_create_playlist() -> Response:
    user = get_current_user()
    if not user:
        return jsonify({"error": "Sign in to create a playlist"}), 401
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Playlist name is required"}), 400
    if len(name) > 60:
        return jsonify({"error": "Playlist name is too long"}), 400

    with get_db() as conn:
        cur = conn.execute("INSERT INTO playlists (user_id, name) VALUES (?, ?)", (user["id"], name))
        pid = cur.lastrowid
        conn.commit()
    return jsonify({"status": "ok", "playlist": {"id": pid, "name": name, "track_count": 0, "cover": ""}})


@app.delete("/api/playlists/<int:playlist_id>")
def api_delete_playlist(playlist_id: int) -> Response:
    user = get_current_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401
    with get_db() as conn:
        res = conn.execute("DELETE FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, user["id"]))
        conn.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?", (playlist_id,))
        conn.commit()
        if res.rowcount == 0:
            return jsonify({"error": "Playlist not found"}), 404
    return jsonify({"status": "ok"})


@app.get("/api/playlists/<int:playlist_id>")
def api_get_playlist_details(playlist_id: int) -> Response:
    user = get_current_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401
    with get_db() as conn:
        p = conn.execute("SELECT id, name, created_at FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, user["id"])).fetchone()
        if not p:
            return jsonify({"error": "Playlist not found"}), 404
        tracks = conn.execute("""
            SELECT id, track_id, title, artist, album, cover, preview, duration_ms, added_at
            FROM playlist_tracks
            WHERE playlist_id = ?
            ORDER BY id ASC
        """, (playlist_id,)).fetchall()
        return jsonify({"playlist": dict(p), "tracks": [dict(t) for t in tracks]})


@app.post("/api/playlists/<int:playlist_id>/tracks")
def api_add_track_to_playlist(playlist_id: int) -> Response:
    user = get_current_user()
    if not user:
        return jsonify({"error": "Sign in to save songs to playlists"}), 401
    data = request.get_json(force=True, silent=True) or {}
    track_id = str(data.get("id") or "")
    title = (data.get("title") or "Unknown").strip()
    artist = (data.get("artist") or "Unknown").strip()
    album = (data.get("album") or "").strip()
    cover = (data.get("cover") or "").strip()
    preview = (data.get("preview") or "").strip()
    duration_ms = int(data.get("duration_ms") or 180000)

    if not preview:
        return jsonify({"error": "Missing audio stream URL"}), 400

    with get_db() as conn:
        p = conn.execute("SELECT id FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, user["id"])).fetchone()
        if not p:
            return jsonify({"error": "Playlist not found"}), 404

        exists = conn.execute(
            "SELECT id FROM playlist_tracks WHERE playlist_id = ? AND (track_id = ? OR (title = ? AND artist = ?))",
            (playlist_id, track_id, title, artist)
        ).fetchone()
        if exists:
            return jsonify({"error": "Track already in this playlist"}), 409

        conn.execute("""
            INSERT INTO playlist_tracks (playlist_id, track_id, title, artist, album, cover, preview, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (playlist_id, track_id, title, artist, album, cover, preview, duration_ms))
        conn.commit()
    return jsonify({"status": "ok", "message": f"Added '{title}' to playlist"})


@app.delete("/api/playlists/<int:playlist_id>/tracks/<int:item_id>")
def api_remove_track_from_playlist(playlist_id: int, item_id: int) -> Response:
    user = get_current_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401
    with get_db() as conn:
        p = conn.execute("SELECT id FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, user["id"])).fetchone()
        if not p:
            return jsonify({"error": "Playlist not found"}), 404
        conn.execute("DELETE FROM playlist_tracks WHERE id = ? AND playlist_id = ?", (item_id, playlist_id))
        conn.commit()
    return jsonify({"status": "ok"})


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
