package com.songplay.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String TAG = "SongPlayApp";
    private WebView webView;
    private FrameLayout rootLayout;
    private FrameLayout customViewContainer;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    @SuppressLint({"SetJavaScriptEnabled", "ObsoleteSdkInt"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Immersive dark status bar & navigation
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Window window = getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(0xFF0A0814);
            window.setNavigationBarColor(0xFF07060F);
        }

        rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(0xFF07060F);

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF07060F);

        customViewContainer = new FrameLayout(this);
        customViewContainer.setVisibility(View.GONE);
        customViewContainer.setBackgroundColor(0xFF000000);

        rootLayout.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        rootLayout.addView(customViewContainer, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(rootLayout);

        // Keep audio running seamlessly
        AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audioManager != null) {
            audioManager.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }

        configureWebView();
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        s.setUserAgentString(s.getUserAgentString() + " SongPlayAndroidApp/1.0");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                customViewContainer.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                customViewContainer.setVisibility(View.VISIBLE);
                webView.setVisibility(View.GONE);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                customViewContainer.removeView(customView);
                customViewContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                }
                customView = null;
                customViewCallback = null;
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.d(TAG, "[WebView Console] " + cm.message() + " -- From line "
                        + cm.lineNumber() + " of " + cm.sourceId());
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if (path == null) path = "";

                // Intercept API search
                if (path.contains("/api/search")) {
                    String query = uri.getQueryParameter("q");
                    int limit = 24;
                    try {
                        String limStr = uri.getQueryParameter("limit");
                        if (limStr != null) limit = Integer.parseInt(limStr);
                    } catch (Exception ignored) {}
                    String json = NativeMusicResolver.search(query, limit);
                    return new WebResourceResponse("application/json", "UTF-8",
                            new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
                }

                // Intercept suggestions / mood packs
                if (path.contains("/api/suggest")) {
                    String json = NativeMusicResolver.getSuggest();
                    return new WebResourceResponse("application/json", "UTF-8",
                            new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
                }

                // Intercept lyrics
                if (path.contains("/api/lyrics")) {
                    String title = uri.getQueryParameter("title");
                    String artist = uri.getQueryParameter("artist");
                    String json = NativeMusicResolver.getLyrics(title, artist);
                    return new WebResourceResponse("application/json", "UTF-8",
                            new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
                }

                // Intercept health check
                if (path.contains("/healthz")) {
                    String json = "{\"status\":\"ok\",\"native\":true}";
                    return new WebResourceResponse("application/json", "UTF-8",
                            new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
                }

                // Intercept webmanifest
                if (path.endsWith("manifest.webmanifest")) {
                    try {
                        InputStream is = getAssets().open("www/static/manifest.webmanifest");
                        return new WebResourceResponse("application/manifest+json", "UTF-8", is);
                    } catch (Exception ignored) {}
                }

                // Intercept sw.js
                if (path.endsWith("sw.js")) {
                    try {
                        InputStream is = getAssets().open("www/sw.js");
                        return new WebResourceResponse("application/javascript", "UTF-8", is);
                    } catch (Exception ignored) {}
                }

                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("file".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    startActivity(intent);
                    return true;
                } catch (Exception ignored) {
                    return false;
                }
            }
        });
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            WebChromeClient client = new WebChromeClient();
            client.onHideCustomView();
            return;
        }
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
