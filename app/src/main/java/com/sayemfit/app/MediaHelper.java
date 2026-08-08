package com.sayemfit.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

/**
 * Meal photos.
 *
 * Images live as JPEGs in the app's private files dir and are handed to the
 * WebView as base64 data URIs on demand — that keeps localStorage (a few MB at
 * best) free of image data while still rendering thumbnails in the meal list.
 *
 * Capture uses ACTION_IMAGE_CAPTURE without EXTRA_OUTPUT on purpose: writing
 * to a shared file would need a FileProvider, which needs AndroidX, which this
 * Gradle-free build does not have. The returned bitmap is small but is exactly
 * a thumbnail, which is all the meal list shows.
 */
public final class MediaHelper {

    public static final int REQ_CAMERA = 4101;
    public static final int REQ_GALLERY = 4102;

    private static final int STORE_MAX_PX = 800;
    private static final int THUMB_MAX_PX = 320;
    private static final int QUALITY = 80;

    private MediaHelper() {
    }

    public static boolean capture(Activity a) {
        try {
            a.startActivityForResult(new Intent(MediaStore.ACTION_IMAGE_CAPTURE), REQ_CAMERA);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public static boolean pick(Activity a) {
        try {
            Intent i = new Intent(Intent.ACTION_GET_CONTENT);
            i.setType("image/*");
            i.addCategory(Intent.CATEGORY_OPENABLE);
            a.startActivityForResult(Intent.createChooser(i, "Photo"), REQ_GALLERY);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** @return the stored photo id, or "" when nothing usable came back. */
    public static String handleResult(Context ctx, int requestCode, Intent data) {
        Bitmap bmp = null;
        try {
            if (requestCode == REQ_CAMERA) {
                if (data != null && data.getExtras() != null) {
                    Object o = data.getExtras().get("data");
                    if (o instanceof Bitmap) bmp = (Bitmap) o;
                }
            } else if (requestCode == REQ_GALLERY) {
                Uri uri = data != null ? data.getData() : null;
                if (uri != null) bmp = decodeScaled(ctx, uri);
            }
            if (bmp == null) return "";
            return store(ctx, bmp);
        } catch (Exception e) {
            return "";
        } finally {
            if (bmp != null && !bmp.isRecycled()) bmp.recycle();
        }
    }

    private static Bitmap decodeScaled(Context ctx, Uri uri) throws Exception {
        BitmapFactory.Options probe = new BitmapFactory.Options();
        probe.inJustDecodeBounds = true;
        InputStream in = ctx.getContentResolver().openInputStream(uri);
        if (in == null) return null;
        try {
            BitmapFactory.decodeStream(in, null, probe);
        } finally {
            in.close();
        }

        int sample = 1;
        int longest = Math.max(probe.outWidth, probe.outHeight);
        while (longest / sample > STORE_MAX_PX * 2) sample *= 2;

        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        InputStream in2 = ctx.getContentResolver().openInputStream(uri);
        if (in2 == null) return null;
        try {
            return BitmapFactory.decodeStream(in2, null, opts);
        } finally {
            in2.close();
        }
    }

    private static String store(Context ctx, Bitmap bmp) throws Exception {
        Bitmap scaled = fit(bmp, STORE_MAX_PX);
        File dir = photoDir(ctx);
        String id = "p" + System.currentTimeMillis();
        File out = new File(dir, id + ".jpg");
        FileOutputStream fos = new FileOutputStream(out);
        try {
            scaled.compress(Bitmap.CompressFormat.JPEG, QUALITY, fos);
        } finally {
            fos.close();
            if (scaled != bmp) scaled.recycle();
        }
        return id;
    }

    /** @return "data:image/jpeg;base64,…" for the WebView, or "". */
    public static String dataUri(Context ctx, String id) {
        if (id == null || id.length() == 0) return "";
        File f = new File(photoDir(ctx), safe(id) + ".jpg");
        if (!f.exists()) return "";
        Bitmap bmp = null, thumb = null;
        try {
            bmp = BitmapFactory.decodeFile(f.getAbsolutePath());
            if (bmp == null) return "";
            thumb = fit(bmp, THUMB_MAX_PX);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            thumb.compress(Bitmap.CompressFormat.JPEG, 75, bos);
            return "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        } finally {
            if (thumb != null && thumb != bmp) thumb.recycle();
            if (bmp != null) bmp.recycle();
        }
    }

    public static void delete(Context ctx, String id) {
        if (id == null || id.length() == 0) return;
        File f = new File(photoDir(ctx), safe(id) + ".jpg");
        if (f.exists()) f.delete();
    }

    private static Bitmap fit(Bitmap src, int maxPx) {
        int w = src.getWidth(), h = src.getHeight();
        int longest = Math.max(w, h);
        if (longest <= maxPx) return src;
        float ratio = (float) maxPx / longest;
        return Bitmap.createScaledBitmap(src, Math.round(w * ratio), Math.round(h * ratio), true);
    }

    private static File photoDir(Context ctx) {
        File dir = new File(ctx.getFilesDir(), "photos");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private static String safe(String id) {
        return id.replaceAll("[^A-Za-z0-9_-]", "");
    }
}
