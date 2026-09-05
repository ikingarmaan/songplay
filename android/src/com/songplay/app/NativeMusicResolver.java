package com.songplay.app;

import android.util.Base64;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;

public class NativeMusicResolver {
    private static final String TAG = "SongPlayResolver";
    private static final String SAAVN_SEARCH = "https://www.jiosaavn.com/api.php";
    private static final String ITUNES_SEARCH = "https://itunes.apple.com/search";
    private static final String DEEZER_SEARCH = "https://api.deezer.com/search";
    private static final String LRCLIB_URL = "https://lrclib.net/api/get";

    private static final String USER_AGENT = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 SongPlayApp/1.0";

    public static String decryptSaavnUrl(String enc) {
        if (enc == null || enc.trim().isEmpty()) return null;
        try {
            byte[] raw = Base64.decode(enc.trim(), Base64.DEFAULT);
            SecretKeySpec keySpec = new SecretKeySpec("38346591".getBytes(StandardCharsets.UTF_8), "DES");
            Cipher cipher = Cipher.getInstance("DES/ECB/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, keySpec);
            byte[] decrypted = cipher.doFinal(raw);
            String url = new String(decrypted, StandardCharsets.UTF_8).trim();
            if (url.contains(".mp4")) {
                url = url.substring(0, url.indexOf(".mp4") + 4);
            }
            if (!url.startsWith("http")) return null;
            return url.replace("_96.mp4", "_160.mp4");
        } catch (Exception e) {
            Log.w(TAG, "DES decrypt error", e);
            return null;
        }
    }

    private static String httpGet(String urlStr) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", USER_AGENT);
            conn.setRequestProperty("Accept", "application/json, text/plain, */*");
            conn.setConnectTimeout(7000);
            conn.setReadTimeout(7000);
            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                InputStream is = conn.getInputStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();
                return sb.toString();
            }
        } catch (Exception e) {
            Log.w(TAG, "HTTP GET failed: " + urlStr, e);
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    public static String search(String query, int limit) {
        if (query == null) query = "";
        query = query.trim();
        if (limit <= 0) limit = 24;
        if (limit > 50) limit = 50;

        JSONArray results = new JSONArray();

        // 1. JioSaavn (Full Songs)
        try {
            String url = SAAVN_SEARCH + "?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&p=1"
                    + "&q=" + URLEncoder.encode(query, "UTF-8")
                    + "&n=" + limit;
            String jsonStr = httpGet(url);
            if (jsonStr != null && !jsonStr.isEmpty()) {
                JSONObject obj = new JSONObject(jsonStr);
                JSONArray saavnResults = obj.optJSONArray("results");
                if (saavnResults != null) {
                    for (int i = 0; i < saavnResults.length(); i++) {
                        JSONObject item = saavnResults.getJSONObject(i);
                        JSONObject moreInfo = item.optJSONObject("more_info");
                        if (moreInfo == null) continue;
                        String encUrl = moreInfo.optString("encrypted_media_url", "");
                        String stream = decryptSaavnUrl(encUrl);
                        if (stream == null || stream.isEmpty()) continue;

                        String title = item.optString("title", item.optString("song", "Unknown"));
                        String artist = "";
                        JSONObject artistMap = moreInfo.optJSONObject("artistMap");
                        if (artistMap != null) {
                            JSONArray primary = artistMap.optJSONArray("primary_artists");
                            if (primary != null && primary.length() > 0) {
                                StringBuilder sb = new StringBuilder();
                                for (int p = 0; p < primary.length(); p++) {
                                    JSONObject pa = primary.optJSONObject(p);
                                    if (pa != null) {
                                        if (sb.length() > 0) sb.append(", ");
                                        sb.append(pa.optString("name", ""));
                                    }
                                }
                                artist = sb.toString();
                            }
                        }
                        if (artist.isEmpty()) {
                            artist = item.optString("subtitle", moreInfo.optString("music", "Unknown"));
                        }

                        String album = moreInfo.optString("album", "");
                        String rawImg = item.optString("image", "");
                        String cover = rawImg.replace("150x150", "500x500").replace("50x50", "500x500");
                        int durSec = 0;
                        try {
                            durSec = Integer.parseInt(moreInfo.optString("duration", "0"));
                        } catch (Exception ignored) {}
                        int durMs = durSec > 0 ? (durSec * 1000) : 180000;

                        JSONObject track = new JSONObject();
                        track.put("id", "saavn_" + item.optString("id", String.valueOf(i)));
                        track.put("title", title);
                        track.put("artist", artist);
                        track.put("album", album);
                        track.put("cover", cover);
                        track.put("preview", stream);
                        track.put("duration_ms", durMs);
                        track.put("release", item.optString("year", moreInfo.optString("release_date", "")));
                        track.put("genre", moreInfo.optString("language", ""));
                        track.put("is_full", true);
                        results.put(track);
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Saavn search error", e);
        }

        // 2. iTunes Fallback
        if (results.length() == 0) {
            try {
                String url = ITUNES_SEARCH + "?media=music&entity=song"
                        + "&term=" + URLEncoder.encode(query, "UTF-8")
                        + "&limit=" + limit;
                String jsonStr = httpGet(url);
                if (jsonStr != null && !jsonStr.isEmpty()) {
                    JSONObject obj = new JSONObject(jsonStr);
                    JSONArray itunesResults = obj.optJSONArray("results");
                    if (itunesResults != null) {
                        for (int i = 0; i < itunesResults.length(); i++) {
                            JSONObject item = itunesResults.getJSONObject(i);
                            String preview = item.optString("previewUrl", "");
                            if (preview.isEmpty()) continue;
                            String cover = item.optString("artworkUrl100", "").replace("100x100bb", "300x300bb");

                            JSONObject track = new JSONObject();
                            track.put("id", "itunes_" + item.optString("trackId", String.valueOf(i)));
                            track.put("title", item.optString("trackName", "Unknown"));
                            track.put("artist", item.optString("artistName", "Unknown"));
                            track.put("album", item.optString("collectionName", ""));
                            track.put("cover", cover);
                            track.put("preview", preview);
                            track.put("duration_ms", item.optInt("trackTimeMillis", 30000));
                            track.put("release", item.optString("releaseDate", ""));
                            track.put("genre", item.optString("primaryGenreName", ""));
                            track.put("is_full", false);
                            results.put(track);
                        }
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "iTunes search error", e);
            }
        }

        // 3. Deezer Fallback
        if (results.length() == 0) {
            try {
                String url = DEEZER_SEARCH + "?q=" + URLEncoder.encode(query, "UTF-8") + "&limit=" + limit;
                String jsonStr = httpGet(url);
                if (jsonStr != null && !jsonStr.isEmpty()) {
                    JSONObject obj = new JSONObject(jsonStr);
                    JSONArray deezerResults = obj.optJSONArray("data");
                    if (deezerResults != null) {
                        for (int i = 0; i < deezerResults.length(); i++) {
                            JSONObject item = deezerResults.getJSONObject(i);
                            String preview = item.optString("preview", "");
                            if (preview.isEmpty()) continue;
                            JSONObject artistObj = item.optJSONObject("artist");
                            JSONObject albumObj = item.optJSONObject("album");
                            String artist = artistObj != null ? artistObj.optString("name", "Unknown") : "Unknown";
                            String album = albumObj != null ? albumObj.optString("title", "") : "";
                            String cover = albumObj != null ? albumObj.optString("cover_big", albumObj.optString("cover_medium", "")) : "";
                            int dur = item.optInt("duration", 30);

                            JSONObject track = new JSONObject();
                            track.put("id", "deezer_" + item.optString("id", String.valueOf(i)));
                            track.put("title", item.optString("title", "Unknown"));
                            track.put("artist", artist);
                            track.put("album", album);
                            track.put("cover", cover);
                            track.put("preview", preview);
                            track.put("duration_ms", dur * 1000);
                            track.put("release", "");
                            track.put("genre", "");
                            track.put("is_full", false);
                            results.put(track);
                        }
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Deezer search error", e);
            }
        }

        // 4. Offline Curated Fallback
        if (results.length() == 0) {
            results = getOfflineCatalog(query, limit);
        }

        JSONObject resp = new JSONObject();
        try {
            resp.put("query", query);
            resp.put("count", results.length());
            resp.put("results", results);
            resp.put("cached", false);
        } catch (Exception ignored) {}
        return resp.toString();
    }

    private static JSONArray getOfflineCatalog(String query, int limit) {
        JSONArray arr = new JSONArray();
        String[][] tracks = new String[][]{
            {"curated_1", "Midnight City Chill", "SongPlay Lo-Fi Collective", "Endless Nights", "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80", "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3", "147000", "Lo-Fi"},
            {"curated_2", "Starlight Echoes", "Aetheria", "Celestial Drift", "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=500&auto=format&fit=crop&q=80", "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=electronic-future-beats-117997.mp3", "165000", "Electronic"},
            {"curated_3", "Acoustic Sunrise", "Horizon Acoustic", "Golden Hour", "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=500&auto=format&fit=crop&q=80", "https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f792cb.mp3?filename=acoustic-guitars-ambient-uplifting-123490.mp3", "138000", "Acoustic"},
            {"curated_4", "Cyberpunk Neon Drive", "Synthwave Prime", "Retroverse 2099", "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop&q=80", "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=synthwave-80s-110045.mp3", "180000", "Synthwave"},
            {"curated_5", "Deep Focus Meditation", "Zenith Soundscapes", "Mindful Waves", "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=500&auto=format&fit=crop&q=80", "https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=meditation-ambient-7090.mp3", "210000", "Ambient"},
            {"curated_6", "Upbeat Summer Groove", "Solaris Funk", "Tropical Sunshine", "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80", "https://cdn.pixabay.com/download/audio/2022/01/26/audio_d0c6ff1101.mp3?filename=summer-tropical-house-113524.mp3", "154000", "Pop"}
        };
        try {
            for (String[] t : tracks) {
                if (arr.length() >= limit) break;
                JSONObject o = new JSONObject();
                o.put("id", t[0]);
                o.put("title", t[1]);
                o.put("artist", t[2]);
                o.put("album", t[3]);
                o.put("cover", t[4]);
                o.put("preview", t[5]);
                o.put("duration_ms", Integer.parseInt(t[6]));
                o.put("release", "2025");
                o.put("genre", t[7]);
                o.put("is_full", true);
                arr.put(o);
            }
        } catch (Exception ignored) {}
        return arr;
    }

    public static String getSuggest() {
        return "{\"packs\":["
                + "{\"id\":\"trending\",\"name\":\"Trending Today\",\"q\":\"top hits 2025\",\"icon\":\"🔥\",\"color\":\"linear-gradient(135deg,#ff5e3a,#ffb35c)\"},"
                + "{\"id\":\"chill\",\"name\":\"Chill Vibes\",\"q\":\"lofi chill\",\"icon\":\"🌊\",\"color\":\"linear-gradient(135deg,#3ad6ff,#a06bff)\"},"
                + "{\"id\":\"romantic\",\"name\":\"Romantic\",\"q\":\"love songs\",\"icon\":\"💖\",\"color\":\"linear-gradient(135deg,#ff5fa2,#ffb35c)\"},"
                + "{\"id\":\"workout\",\"name\":\"Workout Energy\",\"q\":\"workout motivation\",\"icon\":\"💪\",\"color\":\"linear-gradient(135deg,#ff5e3a,#a06bff)\"},"
                + "{\"id\":\"party\",\"name\":\"Party Anthems\",\"q\":\"party dance\",\"icon\":\"🎉\",\"color\":\"linear-gradient(135deg,#a06bff,#ff5fa2)\"},"
                + "{\"id\":\"bolly\",\"name\":\"Bollywood Hits\",\"q\":\"bollywood hits\",\"icon\":\"🎬\",\"color\":\"linear-gradient(135deg,#ffb35c,#ff5fa2)\"},"
                + "{\"id\":\"punjabi\",\"name\":\"Punjabi Beats\",\"q\":\"punjabi hits\",\"icon\":\"🪘\",\"color\":\"linear-gradient(135deg,#3ad6ff,#ff5fa2)\"},"
                + "{\"id\":\"focus\",\"name\":\"Deep Focus\",\"q\":\"instrumental focus\",\"icon\":\"🧠\",\"color\":\"linear-gradient(135deg,#0f3a4d,#3ad6ff)\"},"
                + "{\"id\":\"hiphop\",\"name\":\"Hip Hop\",\"q\":\"hip hop rap\",\"icon\":\"🎤\",\"color\":\"linear-gradient(135deg,#1a1a2e,#a06bff)\"},"
                + "{\"id\":\"rock\",\"name\":\"Rock Classics\",\"q\":\"rock classics\",\"icon\":\"🎸\",\"color\":\"linear-gradient(135deg,#a06bff,#0f3a4d)\"},"
                + "{\"id\":\"edm\",\"name\":\"EDM Drops\",\"q\":\"edm festival\",\"icon\":\"⚡\",\"color\":\"linear-gradient(135deg,#3ad6ff,#a06bff)\"},"
                + "{\"id\":\"sleep\",\"name\":\"Sleep Sounds\",\"q\":\"sleep calm ambient\",\"icon\":\"🌙\",\"color\":\"linear-gradient(135deg,#1a1a2e,#3ad6ff)\"}"
                + "]}";
    }

    public static String getLyrics(String title, String artist) {
        if (title == null || title.isEmpty()) return "{\"synced\":false,\"lines\":[],\"instrumental\":false}";
        try {
            String url = LRCLIB_URL + "?track_name=" + URLEncoder.encode(title, "UTF-8")
                    + (artist != null && !artist.isEmpty() ? "&artist_name=" + URLEncoder.encode(artist, "UTF-8") : "");
            String resp = httpGet(url);
            if (resp != null) {
                JSONObject obj = new JSONObject(resp);
                String syncedLrc = obj.optString("syncedLyrics", "");
                String plainLrc = obj.optString("plainLyrics", "");
                boolean isInstrumental = obj.optBoolean("instrumental", false);
                JSONObject out = new JSONObject();
                out.put("instrumental", isInstrumental);
                if (!syncedLrc.isEmpty()) {
                    out.put("synced", true);
                    out.put("lines", parseLrc(syncedLrc));
                } else if (!plainLrc.isEmpty()) {
                    out.put("synced", false);
                    JSONArray plainArr = new JSONArray();
                    for (String l : plainLrc.split("\n")) {
                        plainArr.put(l.trim());
                    }
                    out.put("lines", plainArr);
                } else {
                    out.put("synced", false);
                    out.put("lines", new JSONArray());
                }
                return out.toString();
            }
        } catch (Exception e) {
            Log.w(TAG, "Lyrics error", e);
        }
        return "{\"synced\":false,\"lines\":[],\"instrumental\":false}";
    }

    private static JSONArray parseLrc(String lrc) {
        JSONArray arr = new JSONArray();
        if (lrc == null) return arr;
        try {
            for (String line : lrc.split("\n")) {
                line = line.trim();
                if (line.startsWith("[") && line.contains("]")) {
                    int end = line.indexOf("]");
                    String timeStr = line.substring(1, end);
                    String text = line.substring(end + 1).trim();
                    String[] parts = timeStr.split(":");
                    if (parts.length == 2) {
                        float mins = Float.parseFloat(parts[0]);
                        float secs = Float.parseFloat(parts[1]);
                        float totalSec = mins * 60f + secs;
                        JSONObject item = new JSONObject();
                        item.put("time", Math.round(totalSec * 100f) / 100f);
                        item.put("text", text);
                        arr.put(item);
                    }
                }
            }
        } catch (Exception ignored) {}
        return arr;
    }
}
