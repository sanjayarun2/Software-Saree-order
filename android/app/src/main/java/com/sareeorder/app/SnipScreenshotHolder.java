package com.sareeorder.app;

import android.graphics.Bitmap;
import androidx.annotation.Nullable;

/** One-shot full-screen screenshot waiting for crop UI. */
public final class SnipScreenshotHolder {
    private static Bitmap screenshot;

    private SnipScreenshotHolder() {}

    public static synchronized void set(@Nullable Bitmap bitmap) {
        if (screenshot != null && screenshot != bitmap && !screenshot.isRecycled()) {
            screenshot.recycle();
        }
        screenshot = bitmap;
    }

    @Nullable
    public static synchronized Bitmap get() {
        return screenshot;
    }

    public static synchronized void clear() {
        if (screenshot != null && !screenshot.isRecycled()) {
            screenshot.recycle();
        }
        screenshot = null;
    }
}
