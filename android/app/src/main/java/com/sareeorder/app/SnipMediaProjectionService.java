package com.sareeorder.app;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.graphics.Point;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.WindowManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import java.nio.ByteBuffer;

/**
 * Short-lived FGS required on Android 14+ before MediaProjection virtual display.
 */
public class SnipMediaProjectionService extends Service {
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_DATA = "data";
    public static final String ACTION_CAPTURED = "com.sareeorder.app.SNIP_CAPTURED";
    public static final String ACTION_FAILED = "com.sareeorder.app.SNIP_CAPTURE_FAILED";
    public static final String EXTRA_ERROR = "error";

    private static final String CHANNEL_ID = "velo_snip_capture";
    private static final int NOTIF_ID = 7102;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createChannel();
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Velo snip")
            .setContentText("Capturing screen…")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .build();

        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                NOTIF_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            );
        } else {
            startForeground(NOTIF_ID, notification);
        }

        if (intent == null) {
            fail("Missing capture intent");
            return START_NOT_STICKY;
        }
        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED);
        Intent data;
        if (Build.VERSION.SDK_INT >= 33) {
            data = intent.getParcelableExtra(EXTRA_DATA, Intent.class);
        } else {
            data = intent.getParcelableExtra(EXTRA_DATA);
        }
        if (resultCode != Activity.RESULT_OK || data == null) {
            fail("Capture permission missing");
            return START_NOT_STICKY;
        }

        capture(resultCode, data);
        return START_NOT_STICKY;
    }

    private void capture(int resultCode, Intent data) {
        MediaProjectionManager mpm =
            (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (mpm == null) {
            fail("Screen capture unavailable");
            return;
        }
        final MediaProjection projection;
        try {
            projection = mpm.getMediaProjection(resultCode, data);
        } catch (Exception e) {
            fail(e.getMessage() != null ? e.getMessage() : "Projection failed");
            return;
        }
        if (projection == null) {
            fail("Projection denied");
            return;
        }

        WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        Display display = wm.getDefaultDisplay();
        Point size = new Point();
        display.getRealSize(size);
        final int width = size.x;
        final int height = size.y;
        DisplayMetrics metrics = new DisplayMetrics();
        display.getRealMetrics(metrics);
        final int density = metrics.densityDpi;

        final Handler handler = new Handler(Looper.getMainLooper());
        final ImageReader reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        final VirtualDisplay[] vdHolder = new VirtualDisplay[1];
        final boolean[] done = new boolean[] { false };

        MediaProjection.Callback projCb = new MediaProjection.Callback() {};
        projection.registerCallback(projCb, handler);

        vdHolder[0] = projection.createVirtualDisplay(
            "velo-snip",
            width,
            height,
            density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            reader.getSurface(),
            null,
            handler
        );

        reader.setOnImageAvailableListener(imageReader -> {
            if (done[0]) return;
            Image image = null;
            try {
                image = imageReader.acquireLatestImage();
                if (image == null) return;
                done[0] = true;

                Image.Plane[] planes = image.getPlanes();
                ByteBuffer buffer = planes[0].getBuffer();
                int pixelStride = planes[0].getPixelStride();
                int rowStride = planes[0].getRowStride();
                int rowPadding = rowStride - pixelStride * width;

                Bitmap bitmap = Bitmap.createBitmap(
                    width + rowPadding / pixelStride,
                    height,
                    Bitmap.Config.ARGB_8888
                );
                bitmap.copyPixelsFromBuffer(buffer);
                Bitmap cropped = Bitmap.createBitmap(bitmap, 0, 0, width, height);
                if (cropped != bitmap) bitmap.recycle();

                cleanup(projection, projCb, vdHolder[0], reader);
                SnipScreenshotHolder.set(cropped);
                sendBroadcast(new Intent(ACTION_CAPTURED).setPackage(getPackageName()));
                stopSelf();
            } catch (Exception e) {
                cleanup(projection, projCb, vdHolder[0], reader);
                fail(e.getMessage() != null ? e.getMessage() : "Capture failed");
            } finally {
                if (image != null) image.close();
            }
        }, handler);

        handler.postDelayed(() -> {
            if (done[0]) return;
            done[0] = true;
            cleanup(projection, projCb, vdHolder[0], reader);
            fail("Capture timed out");
        }, 4000);
    }

    private void fail(String message) {
        Intent i = new Intent(ACTION_FAILED).setPackage(getPackageName());
        i.putExtra(EXTRA_ERROR, message);
        sendBroadcast(i);
        stopSelf();
    }

    private void cleanup(
        MediaProjection projection,
        MediaProjection.Callback projCb,
        @Nullable VirtualDisplay vd,
        ImageReader reader
    ) {
        try {
            if (vd != null) vd.release();
        } catch (Exception ignored) {}
        try {
            reader.setOnImageAvailableListener(null, null);
            reader.close();
        } catch (Exception ignored) {}
        try {
            projection.unregisterCallback(projCb);
            projection.stop();
        } catch (Exception ignored) {}
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Velo snip capture",
            NotificationManager.IMPORTANCE_LOW
        );
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(channel);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
