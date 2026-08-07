package com.sayemfit.app;

import android.webkit.WebView;
import android.webkit.WebViewClient;

/** The app is fully offline: only bundled asset URLs are allowed to load. */
public class AppWebViewClient extends WebViewClient {

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        return !(url != null && url.startsWith("file:///android_asset/"));
    }
}
