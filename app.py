"""SongPlay — Flask web service.

Serves the single-page music player and proxies the iTunes Search API
so the browser never talks to Apple directly (cleaner CORS, better
caching, future-proof for adding more sources like YouTube/Deezer).
"""
from __future__ import annotations

import os
import json
import time
import logging
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
# Helpers
# ---------------------------------------------------------------------------
def _normalize_track(item: dict[str, Any]) -> dict[str, Any] | None:
    """Map an iTunes result row into our clean public schema."""
    preview = item.get("previewUrl")
    if not preview:
        return None
    cover = (item.get("artworkUrl100") or "").replace("100x100bb", "300x300bb")
    return {
        "id": item.get("trackId"),
        "title": item.get("trackName") or "Unknown",
        "artist": item.get("artistName") or "Unknown",
        "album": item.get("collectionName") or "",
        "cover": cover,
        "preview": preview,
        "duration_ms": item.get("trackTimeMillis") or 30000,
        "release": item.get("releaseDate") or "",
        "genre": item.get("primaryGenreName") or "",
    }


def _fetch_itunes(term: str, limit: int) -> list[dict[str, Any]]:
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
        norm = _normalize_track(raw)
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

    results = _fetch_itunes(term, limit)
    cache.set(cache_key, results)
    return jsonify({"query": term, "count": len(results), "results": results, "cached": False})


@app.get("/api/suggest")
def api_suggest() -> Response:
    """Returns curated mood/genre packs so the front-end never hardcodes them."""
    packs = [
        {"id": "trending", "name": "Trending Today",   "q": "top hits 2025",            "icon": "🔥", "color": "linear-gradient(135deg,#ff5e3a,#ffb35c)"},
        {"id": "chill",    "name": "Chill Vibes",      "q": "lofi chill beats",         "icon": "🌊", "color": "linear-gradient(135deg,#3ad6ff,#a06bff)"},
        {"id": "romantic", "name": "Romantic",         "q": "love romantic songs",      "icon": "💖", "color": "linear-gradient(135deg,#ff5fa2,#ffb35c)"},
        {"id": "workout",  "name": "Workout Energy",   "q": "workout motivation gym",   "icon": "💪", "color": "linear-gradient(135deg,#ff5e3a,#a06bff)"},
        {"id": "party",    "name": "Party Anthems",    "q": "party dance club",         "icon": "🎉", "color": "linear-gradient(135deg,#a06bff,#ff5fa2)"},
        {"id": "bolly",    "name": "Bollywood Hits",   "q": "bollywood hits",           "icon": "🎬", "color": "linear-gradient(135deg,#ffb35c,#ff5fa2)"},
        {"id": "punjabi",  "name": "Punjabi Beats",    "q": "punjabi hits latest",      "icon": "🪘", "color": "linear-gradient(135deg,#3ad6ff,#ff5fa2)"},
        {"id": "focus",    "name": "Deep Focus",       "q": "deep focus instrumental",  "icon": "🧠", "color": "linear-gradient(135deg,#0f3a4d,#3ad6ff)"},
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
