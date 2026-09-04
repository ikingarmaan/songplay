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
import re
import secrets
import sqlite3
import threading
import time
import warnings
from datetime import timedelta
from functools import wraps
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
# Config & Database Resolution
# ---------------------------------------------------------------------------
def get_db_path() -> str:
    """Resolve database path, checking persistent volume mounts before local fallback."""
    if os.environ.get("DATABASE_PATH"):
        return os.environ["DATABASE_PATH"]
    for candidate in ["/var/data", "/data", "/mnt/data"]:
        if os.path.isdir(candidate) and os.access(candidate, os.W_OK):
            return os.path.join(candidate, "songplay.db")
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "songplay.db")

DB_PATH = get_db_path()

def get_secret_key() -> str:
    """Resolve cryptographically secure secret key, persisting locally if not set via env."""
    env_key = os.environ.get("SECRET_KEY")
    if env_key and env_key != "songplay-session-key-dev-2026":
        return env_key
    key_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".secret_key")
    if os.path.exists(key_file):
        try:
            with open(key_file, "r") as f:
                saved = f.read().strip()
                if len(saved) >= 32:
                    return saved
        except Exception:
            pass
    new_key = secrets.token_hex(32)
    try:
        with open(key_file, "w") as f:
            f.write(new_key)
    except Exception:
        pass
    return new_key

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

# Input validation boundaries
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{2,30}$")
TRACK_ID_RE = re.compile(r"^[a-zA-Z0-9_\-\.]{1,100}$")

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = get_secret_key()
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=365)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024  # 2MB max payload limit
app.config["CACHE_TYPE"] = "SimpleCache"
app.config["CACHE_DEFAULT_TIMEOUT"] = CACHE_TTL
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
cache = Cache(app)

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")
log = logging.getLogger("songplay")


# ---------------------------------------------------------------------------
# Security: Sliding-Window Rate Limiter & Client IP
# ---------------------------------------------------------------------------
class RateLimiter:
    """Thread-safe sliding-window in-memory rate limiter."""
    def __init__(self):
        self._lock = threading.Lock()
        self._history: dict[str, list[float]] = {}

    def is_allowed(self, key: str, max_requests: int, window_seconds: float) -> tuple[bool, int]:
        now = time.time()
        with self._lock:
            timestamps = self._history.get(key, [])
            valid_from = now - window_seconds
            timestamps = [t for t in timestamps if t > valid_from]

            if len(timestamps) >= max_requests:
                earliest = timestamps[0]
                retry_after = max(1, int(earliest + window_seconds - now))
                self._history[key] = timestamps
                return False, retry_after

            timestamps.append(now)
            self._history[key] = timestamps

            if len(self._history) > 5000:
                self._cleanup(now)

            return True, 0

    def record_attempt(self, key: str):
        now = time.time()
        with self._lock:
            timestamps = self._history.get(key, [])
            timestamps.append(now)
            self._history[key] = timestamps

    def is_blocked(self, key: str, max_requests: int, window_seconds: float) -> tuple[bool, int]:
        """Check if currently blocked without adding an attempt."""
        now = time.time()
        with self._lock:
            timestamps = self._history.get(key, [])
            valid_from = now - window_seconds
            timestamps = [t for t in timestamps if t > valid_from]
            self._history[key] = timestamps

            if len(timestamps) >= max_requests:
                earliest = timestamps[0]
                retry_after = max(1, int(earliest + window_seconds - now))
                return True, retry_after

            return False, 0

    def reset(self, key: str):
        """Reset attempt history for a specific key."""
        with self._lock:
            self._history.pop(key, None)

    def _cleanup(self, now: float):
        cutoff = now - 3600
        stale = [k for k, v in self._history.items() if not v or v[-1] < cutoff]
        for k in stale:
            self._history.pop(k, None)

rate_limiter = RateLimiter()


def get_client_ip() -> str:
    """Extract real client IP taking standard proxy headers into account."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "127.0.0.1"


# ---------------------------------------------------------------------------
# Security: Response Headers Middleware
# ---------------------------------------------------------------------------
@app.after_request
def apply_security_headers(response: Response) -> Response:
    """Enforce industry-standard HTTP security headers."""
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: blob: https: *; "
        "media-src 'self' data: blob: https: *; "
        "connect-src 'self' https://*.jiosaavn.com https://itunes.apple.com https://lrclib.net; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self';"
    )
    response.headers["Content-Security-Policy"] = csp
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
        "magnetometer=(), microphone=(), payment=(), usb=()"
    )
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"

    if request.is_secure or request.headers.get("X-Forwarded-Proto") == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response


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
                user_token TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Backward-compatible column migration
        try:
            conn.execute("ALTER TABLE users ADD COLUMN user_token TEXT")
        except Exception:
            pass
        try:
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_user_token ON users (user_token)")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE users ADD COLUMN last_login TIMESTAMP")
        except Exception:
            pass
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
    ip = get_client_ip()
    allowed, retry_after = rate_limiter.is_allowed(f"search:{ip}", max_requests=60, window_seconds=60)
    if not allowed:
        resp = jsonify({"error": "Search rate limit exceeded. Please wait a moment."})
        resp.headers["Retry-After"] = str(retry_after)
        return resp, 429

    term = (request.args.get("q") or "").strip()
    term = re.sub(r"[\x00-\x1f\x7f]", "", term)
    if not term:
        return jsonify({"error": "missing query parameter 'q'"}), 400
    if len(term) > 120:
        return jsonify({"error": "query too long (maximum 120 characters)"}), 400

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
# Lyrics Service & Endpoint
# ---------------------------------------------------------------------------
LRC_REGEX = re.compile(r"\[(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)\](.*)")


def _clean_song_title(title: str) -> str:
    """Strip noise from song titles (movie tags, feat info, remix tags)."""
    clean = re.sub(
        r"[\(\[][^\)\]]*(?:from|feat|ft|official|lyric|video|version|remix)[^\)\]]*[\)\]]",
        "",
        title,
        flags=re.IGNORECASE,
    )
    clean = re.sub(r"\s*-\s*$", "", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean or title


def _clean_artist_name(artist: str) -> str:
    """Get primary artist name for cleaner queries."""
    first = re.split(r"[,/&]|(?:\sfeat\.?\s)", artist, flags=re.IGNORECASE)[0]
    return first.strip() or artist


def _parse_lrc(lrc_text: str) -> list[dict[str, Any]]:
    """Convert LRC timestamped lines to [{ time: float, text: str }]."""
    lines: list[dict[str, Any]] = []
    for row in lrc_text.splitlines():
        m = LRC_REGEX.match(row.strip())
        if m:
            mins = int(m.group(1))
            secs = float(m.group(2))
            text = m.group(3).strip()
            lines.append({"time": round(mins * 60 + secs, 2), "text": text})
    return lines


@app.get("/api/lyrics")
def api_lyrics() -> Response:
    """Fetch time-synced or plain lyrics for the given song."""
    ip = get_client_ip()
    allowed, retry_after = rate_limiter.is_allowed(f"lyrics:{ip}", max_requests=60, window_seconds=60)
    if not allowed:
        resp = jsonify({"found": False, "synced": False, "lines": [], "plain": "Rate limit exceeded. Please wait a moment."})
        resp.headers["Retry-After"] = str(retry_after)
        return resp, 429

    title = (request.args.get("title") or "").strip()[:120]
    artist = (request.args.get("artist") or "").strip()[:120]
    title = re.sub(r"[\x00-\x1f\x7f]", "", title)
    artist = re.sub(r"[\x00-\x1f\x7f]", "", artist)
    dur_str = request.args.get("duration") or "0"
    try:
        duration = int(float(dur_str))
    except (ValueError, TypeError):
        duration = 0

    if not title:
        return jsonify({"found": False, "synced": False, "lines": [], "plain": "No title specified"}), 400

    clean_title = _clean_song_title(title)
    clean_artist = _clean_artist_name(artist)

    cache_key = f"lyrics:{clean_title.lower()}:{clean_artist.lower()}"
    cached = cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)

    result: dict[str, Any] = {"found": False, "synced": False, "lines": [], "plain": ""}

    # 1. Try LRCLIB exact match (/api/get)
    try:
        params: dict[str, Any] = {
            "track_name": clean_title,
            "artist_name": clean_artist,
        }
        if duration > 0:
            params["duration"] = duration

        r = requests.get(
            "https://lrclib.net/api/get",
            params=params,
            headers={"User-Agent": "SongPlay/1.0"},
            timeout=4,
        )
        if r.status_code == 200:
            data = r.json()
            synced = data.get("syncedLyrics")
            plain = data.get("plainLyrics") or ""
            if synced:
                lines = _parse_lrc(synced)
                if lines:
                    result = {
                        "found": True,
                        "synced": True,
                        "lines": lines,
                        "plain": plain,
                        "track_name": data.get("trackName"),
                        "artist_name": data.get("artistName"),
                    }
            elif plain:
                result = {
                    "found": True,
                    "synced": False,
                    "lines": [],
                    "plain": plain,
                    "track_name": data.get("trackName"),
                    "artist_name": data.get("artistName"),
                }
    except Exception as exc:
        log.warning("LRCLIB /api/get error: %s", exc)

    # 2. Fallback: Try LRCLIB search (/api/search)
    if not result.get("found"):
        try:
            query = f"{clean_title} {clean_artist}".strip()
            r = requests.get(
                "https://lrclib.net/api/search",
                params={"q": query},
                headers={"User-Agent": "SongPlay/1.0"},
                timeout=4,
            )
            if r.status_code == 200:
                items = r.json()
                if isinstance(items, list) and items:
                    best = next((it for it in items if it.get("syncedLyrics")), None)
                    if not best:
                        best = next((it for it in items if it.get("plainLyrics")), items[0])

                    synced = best.get("syncedLyrics")
                    plain = best.get("plainLyrics") or ""
                    if synced:
                        lines = _parse_lrc(synced)
                        if lines:
                            result = {
                                "found": True,
                                "synced": True,
                                "lines": lines,
                                "plain": plain,
                                "track_name": best.get("trackName"),
                                "artist_name": best.get("artistName"),
                            }
                    elif plain:
                        result = {
                            "found": True,
                            "synced": False,
                            "lines": [],
                            "plain": plain,
                            "track_name": best.get("trackName"),
                            "artist_name": best.get("artistName"),
                        }
        except Exception as exc:
            log.warning("LRCLIB /api/search error: %s", exc)

    cache.set(cache_key, result, timeout=86400)
    return jsonify(result)


# ---------------------------------------------------------------------------
# Auth Helpers & Endpoints
# ---------------------------------------------------------------------------
def get_current_user() -> dict[str, Any] | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    try:
        with get_db() as conn:
            user = conn.execute("SELECT id, username, user_token, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
            if user:
                return dict(user)
    except Exception as exc:
        log.warning("get_current_user error: %s", exc)
    return None


@app.post("/api/auth/register")
def api_register() -> Response:
    ip = get_client_ip()
    allowed, retry_after = rate_limiter.is_allowed(f"register:{ip}", max_requests=10, window_seconds=3600)
    if not allowed:
        resp = jsonify({"error": "Registration rate limit exceeded. Please try again later."})
        resp.headers["Retry-After"] = str(retry_after)
        return resp, 429

    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not USERNAME_RE.match(username):
        return jsonify({"error": "Username must be 2-30 characters (letters, numbers, hyphens, dots, underscores only)"}), 400
    if not password or len(password) < 4:
        return jsonify({"error": "Password must be at least 4 characters"}), 400
    if len(password) > 128:
        return jsonify({"error": "Password cannot exceed 128 characters"}), 400

    password_hash = generate_password_hash(password)
    user_token = secrets.token_hex(24)
    try:
        with get_db() as conn:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, user_token) VALUES (?, ?, ?)",
                (username, password_hash, user_token)
            )
            user_id = cur.lastrowid
            # Create a default "Favorites" playlist for new users
            conn.execute("INSERT INTO playlists (user_id, name) VALUES (?, ?)", (user_id, "Favorites"))
            conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Username is already taken"}), 409

    session.permanent = True
    session["user_id"] = user_id
    session["username"] = username
    session["user_token"] = user_token
    return jsonify({"status": "ok", "user": {"id": user_id, "username": username, "user_token": user_token}})


@app.post("/api/auth/login")
def api_login() -> Response:
    ip = get_client_ip()
    blocked, retry_after = rate_limiter.is_blocked(f"login_fail:{ip}", max_requests=5, window_seconds=300)
    if blocked:
        resp = jsonify({"error": f"Too many failed login attempts. Please wait {retry_after} seconds before trying again."})
        resp.headers["Retry-After"] = str(retry_after)
        return resp, 429

    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    client_backup = data.get("clientBackup") or {}

    if not username or not password:
        return jsonify({"error": "Please enter both username and password"}), 400
    if len(password) > 128:
        return jsonify({"error": "Invalid username or password"}), 400

    with get_db() as conn:
        user = conn.execute(
            "SELECT id, username, password_hash, user_token FROM users WHERE username = ?",
            (username,)
        ).fetchone()

        if not user:
            # Check if this user was registered on this device and lost due to ephemeral deploy
            if client_backup and (client_backup.get("username") or "").strip().lower() == username.lower():
                user_token = client_backup.get("user_token") or secrets.token_hex(24)
                cur = conn.execute(
                    "INSERT INTO users (username, password_hash, user_token) VALUES (?, ?, ?)",
                    (username, generate_password_hash(password), user_token)
                )
                user_id = cur.lastrowid
                backup_pls = client_backup.get("playlists") or []
                for pl in backup_pls:
                    p_cur = conn.execute("INSERT INTO playlists (user_id, name) VALUES (?, ?)", (user_id, pl.get("name") or "Favorites"))
                    new_pl_id = p_cur.lastrowid
                    for trk in (pl.get("tracks") or []):
                        conn.execute("""
                            INSERT INTO playlist_tracks (playlist_id, track_id, title, artist, album, cover, preview, duration_ms)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            new_pl_id,
                            trk.get("track_id") or trk.get("id") or "trk",
                            trk.get("title") or "Unknown Title",
                            trk.get("artist") or "Unknown Artist",
                            trk.get("album") or "",
                            trk.get("cover") or "",
                            trk.get("preview") or "",
                            trk.get("duration_ms") or 180000,
                        ))
                if not backup_pls:
                    conn.execute("INSERT INTO playlists (user_id, name) VALUES (?, ?)", (user_id, "Favorites"))
                conn.commit()

                rate_limiter.reset(f"login_fail:{ip}")
                session.permanent = True
                session["user_id"] = user_id
                session["username"] = username
                session["user_token"] = user_token
                log.info("Restored user '%s' from client backup during login", username)
                return jsonify({
                    "status": "ok",
                    "restored": True,
                    "user": {"id": user_id, "username": username, "user_token": user_token}
                })

            rate_limiter.record_attempt(f"login_fail:{ip}")
            return jsonify({"error": "Invalid username or password"}), 401

        if not check_password_hash(user["password_hash"], password):
            rate_limiter.record_attempt(f"login_fail:{ip}")
            return jsonify({"error": "Invalid username or password"}), 401

        user_token = user["user_token"]
        if not user_token:
            user_token = secrets.token_hex(24)
            conn.execute("UPDATE users SET user_token = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?", (user_token, user["id"]))
        else:
            conn.execute("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", (user["id"],))
        conn.commit()

        rate_limiter.reset(f"login_fail:{ip}")
        session.permanent = True
        session["user_id"] = user["id"]
        session["username"] = user["username"]
        session["user_token"] = user_token
        return jsonify({
            "status": "ok",
            "user": {"id": user["id"], "username": user["username"], "user_token": user_token}
        })


@app.post("/api/auth/sync")
def api_auth_sync() -> Response:
    """Seamless session & account auto-sync.
    Survives container rebuilds / cloud redeploys by recovering users and playlists from client storage.
    """
    ip = get_client_ip()
    allowed, retry_after = rate_limiter.is_allowed(f"sync:{ip}", max_requests=30, window_seconds=60)
    if not allowed:
        resp = jsonify({"authenticated": False, "error": "Too many sync requests. Please wait."})
        resp.headers["Retry-After"] = str(retry_after)
        return resp, 429

    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password_cred = (data.get("password_cred") or "").strip()
    user_token = (data.get("user_token") or "").strip()
    backup_playlists = data.get("playlists") or []

    if not username or not USERNAME_RE.match(username):
        return jsonify({"authenticated": False, "error": "Invalid username format"}), 400
    if password_cred and len(password_cred) > 128:
        return jsonify({"authenticated": False, "error": "Invalid password length"}), 400

    with get_db() as conn:
        user = conn.execute(
            "SELECT id, username, password_hash, user_token FROM users WHERE username = ?",
            (username,)
        ).fetchone()

        restored = False
        user_id = None

        if user:
            # Check user token or password match
            valid = False
            if user_token and user["user_token"] and user["user_token"] == user_token:
                valid = True
            elif password_cred and check_password_hash(user["password_hash"], password_cred):
                valid = True
            elif user["user_token"] is None and password_cred:
                valid = check_password_hash(user["password_hash"], password_cred)

            if not valid:
                return jsonify({"authenticated": False, "error": "Credentials do not match"}), 401

            user_id = user["id"]
            assigned_token = user["user_token"] or user_token or secrets.token_hex(24)
            conn.execute("UPDATE users SET user_token = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?", (assigned_token, user_id))
            conn.commit()
        else:
            # User was wiped by cloud container rebuild / deploy
            if not password_cred and not user_token:
                return jsonify({"authenticated": False, "error": "Account not found on server"}), 404

            p_hash = generate_password_hash(password_cred) if password_cred else generate_password_hash(user_token)
            assigned_token = user_token or secrets.token_hex(24)
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, user_token) VALUES (?, ?, ?)",
                (username, p_hash, assigned_token)
            )
            user_id = cur.lastrowid
            restored = True
            log.info("Auto-restored user '%s' (id=%s) after server redeployment", username, user_id)

            for pl in backup_playlists:
                pl_name = (pl.get("name") or "Favorites").strip()
                p_cur = conn.execute("INSERT INTO playlists (user_id, name) VALUES (?, ?)", (user_id, pl_name))
                new_pl_id = p_cur.lastrowid
                for trk in (pl.get("tracks") or []):
                    conn.execute("""
                        INSERT INTO playlist_tracks (playlist_id, track_id, title, artist, album, cover, preview, duration_ms)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        new_pl_id,
                        trk.get("track_id") or trk.get("id") or "trk",
                        trk.get("title") or "Unknown Title",
                        trk.get("artist") or "Unknown Artist",
                        trk.get("album") or "",
                        trk.get("cover") or "",
                        trk.get("preview") or "",
                        trk.get("duration_ms") or 180000,
                    ))

            if not backup_playlists:
                conn.execute("INSERT INTO playlists (user_id, name) VALUES (?, ?)", (user_id, "Favorites"))

            conn.commit()

        session.permanent = True
        session["user_id"] = user_id
        session["username"] = username
        session["user_token"] = assigned_token

        return jsonify({
            "authenticated": True,
            "status": "ok",
            "restored": restored,
            "user": {
                "id": user_id,
                "username": username,
                "user_token": assigned_token
            }
        })


@app.post("/api/auth/logout")
def api_logout() -> Response:
    session.clear()
    return jsonify({"status": "ok"})


@app.get("/api/auth/me")
def api_me() -> Response:
    user = get_current_user()
    if not user:
        return jsonify({"authenticated": False, "user": None})
    return jsonify({
        "authenticated": True,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "user_token": user.get("user_token")
        }
    })


# ---------------------------------------------------------------------------
# Playlist Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/playlists")
def api_get_playlists() -> Response:
    user = get_current_user()
    if not user:
        return jsonify({"error": "Sign in to access your playlists"}), 401

    include_tracks = request.args.get("include_tracks") == "1"

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

        playlists = [dict(r) for r in rows]

        if include_tracks:
            for pl in playlists:
                tracks = conn.execute("""
                    SELECT track_id, title, artist, album, cover, preview, duration_ms, added_at
                    FROM playlist_tracks
                    WHERE playlist_id = ?
                    ORDER BY id ASC
                """, (pl["id"],)).fetchall()
                pl["tracks"] = [dict(t) for t in tracks]

        return jsonify({"playlists": playlists})


@app.post("/api/playlists")
def api_create_playlist() -> Response:
    user = get_current_user()
    if not user:
        return jsonify({"error": "Sign in to create a playlist"}), 401
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()[:60]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)
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
    track_id = str(data.get("id") or data.get("track_id") or "").strip()[:100]
    track_id = re.sub(r"[\x00-\x1f\x7f]", "", track_id)
    if not track_id:
        track_id = secrets.token_hex(8)

    title = (data.get("title") or "Unknown").strip()[:120]
    artist = (data.get("artist") or "Unknown").strip()[:120]
    album = (data.get("album") or "").strip()[:120]
    cover = (data.get("cover") or "").strip()[:500]
    preview = (data.get("preview") or data.get("stream_url") or "").strip()[:1000]

    title = re.sub(r"[\x00-\x1f\x7f]", "", title)
    artist = re.sub(r"[\x00-\x1f\x7f]", "", artist)
    album = re.sub(r"[\x00-\x1f\x7f]", "", album)

    try:
        duration_ms = int(data.get("duration_ms") or 180000)
    except (ValueError, TypeError):
        duration_ms = 180000

    if not preview or not preview.startswith(("http://", "https://")):
        return jsonify({"error": "Invalid or missing audio stream URL"}), 400

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
@app.errorhandler(400)
def bad_request(e):
    return jsonify({"error": "Bad request", "details": str(getattr(e, "description", "Invalid request"))}), 400


@app.errorhandler(401)
def unauthorized(_e):
    return jsonify({"error": "Authentication required"}), 401


@app.errorhandler(403)
def forbidden(_e):
    return jsonify({"error": "Access forbidden"}), 403


@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return render_template("index.html"), 200  # SPA fallback


@app.errorhandler(413)
def payload_too_large(_e):
    return jsonify({"error": "Payload too large. Maximum allowed size is 2MB"}), 413


@app.errorhandler(429)
def too_many_requests(e):
    retry_after = getattr(e, "retry_after", 60)
    resp = jsonify({"error": "Too many requests. Please slow down and try again later.", "retry_after": retry_after})
    resp.headers["Retry-After"] = str(retry_after)
    return resp, 429


@app.errorhandler(500)
def server_error(e):
    log.exception("Internal server error: %s", e)
    return jsonify({"error": "An internal server error occurred"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
