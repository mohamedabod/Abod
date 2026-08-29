package com.sayemfit.app;

import android.app.Activity;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Turns the report's HTML into a PDF using Android's own print pipeline.
 *
 * No PDF library is involved. A WebView can produce a PrintDocumentAdapter,
 * and PrintManager renders that through the system print dialog, where
 * "Save as PDF" is always offered. That keeps the APK the size it is and
 * gives the user the destination picker they already know.
 *
 * The WebView must stay referenced until the adapter has finished with it:
 * printing is asynchronous, and a garbage-collected WebView produces a blank
 * document. The field below is what keeps it alive.
 */
final class PdfExporter {

    /** Held only so the WebView survives until printing completes. */
    private static WebView pending;

    private PdfExporter() {
    }

    /**
     * @param html a complete, self-contained HTML document
     * @param name file name offered in the print dialog, without extension
     */
    static void print(final Activity activity, final String html, final String name) {
        final WebView web = new WebView(activity);
        web.getSettings().setJavaScriptEnabled(false);
        // The document carries its own images as data: URIs and loads nothing
        // else, so no network access is needed or wanted here.
        web.getSettings().setBlockNetworkLoads(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                PrintManager pm = (PrintManager) activity.getSystemService(Activity.PRINT_SERVICE);
                if (pm == null) {
                    pending = null;
                    return;
                }
                String job = name == null || name.length() == 0 ? "report" : name;
                PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(job);
                PrintAttributes attrs = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                        .build();
                try {
                    pm.print(job, adapter, attrs);
                } catch (Exception ignored) {
                    // The user has no print service, or the dialog was refused.
                } finally {
                    // The adapter holds its own reference from here on.
                    pending = null;
                }
            }
        });

        pending = web;
        web.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }
}
