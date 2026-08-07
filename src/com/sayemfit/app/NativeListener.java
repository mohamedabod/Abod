package com.sayemfit.app;

/**
 * Push channel from the native layer up into the WebView.
 * Implemented by JsBridge. Kept as a separate top-level type on purpose:
 * the manual d8 pipeline used by this project chokes on anonymous inner classes.
 */
public interface NativeListener {
    void onNativeEvent(String type, String json);
}
