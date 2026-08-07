package com.sayemfit.app;

import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;

/** Forwards WebView console output to logcat (adb logcat -s SayemApp). */
public class AppChromeClient extends WebChromeClient {

    @Override
    public boolean onConsoleMessage(ConsoleMessage m) {
        Log.d("SayemApp", m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
        return true;
    }
}
