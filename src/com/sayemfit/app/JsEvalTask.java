package com.sayemfit.app;

import android.webkit.WebView;

/** Runs an evaluateJavascript call on the WebView's own thread. */
public class JsEvalTask implements Runnable {

    private final WebView web;
    private final String js;

    public JsEvalTask(WebView w, String js) {
        this.web = w;
        this.js = js;
    }

    @Override
    public void run() {
        try {
            web.evaluateJavascript(js, null);
        } catch (Exception ignored) {
        }
    }
}
