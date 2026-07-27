package com.sareeorder.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/** Draggable floating bubble that opens the snip / OCR flow. */
public class SnipOverlayService extends Service {
    public static final String ACTION_START = "com.sareeorder.app.SNIP_OVERLAY_START";
    public static final String ACTION_STOP = "com.sareeorder.app.SNIP_OVERLAY_STOP";
    private static final String CHANNEL_ID = "velo_snip_overlay";
    private static final int NOTIF_ID = 7101;

    private static SnipOverlayService instance;
    private WindowManager windowManager;
    private View bubbleView;
    private WindowManager.LayoutParams bubbleParams;
    private boolean bubbleVisible = true;

    public static boolean isRunning() {
        return instance != null;
    }

    public static void setBubbleVisible(boolean visible) {
        if (instance != null) {
            instance.applyBubbleVisibility(visible);
        }
    }

    public static boolean canDrawOverlays(Context context) {
        return Settings.canDrawOverlays(context);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        createChannel();
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                NOTIF_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            );
        } else {
            startForeground(NOTIF_ID, notification);
        }
        if (canDrawOverlays(this)) {
            addBubble();
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!canDrawOverlays(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (bubbleView == null) {
            addBubble();
        }
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        removeBubble();
        instance = null;
        super.onDestroy();
    }

    private void applyBubbleVisibility(boolean visible) {
        bubbleVisible = visible;
        if (bubbleView == null || bubbleParams == null || windowManager == null) return;
        try {
            bubbleView.setVisibility(visible ? View.VISIBLE : View.GONE);
            windowManager.updateViewLayout(bubbleView, bubbleParams);
        } catch (Exception ignored) {}
    }

    private void addBubble() {
        if (bubbleView != null || windowManager == null) return;

        TextView bubble = new TextView(this);
        bubble.setText("V");
        bubble.setTextColor(Color.WHITE);
        bubble.setTextSize(18f);
        bubble.setGravity(Gravity.CENTER);
        int pad = dp(14);
        bubble.setPadding(pad, pad, pad, pad);

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#4F46E5"));
        bg.setCornerRadius(dp(28));
        bubble.setBackground(bg);
        bubble.setElevation(dp(6));

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        bubbleParams = new WindowManager.LayoutParams(
            dp(56),
            dp(56),
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        bubbleParams.gravity = Gravity.TOP | Gravity.START;
        bubbleParams.x = dp(16);
        bubbleParams.y = dp(120);

        bubble.setOnTouchListener(new View.OnTouchListener() {
            private int lastX;
            private int lastY;
            private float downRawX;
            private float downRawY;
            private boolean moved;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        lastX = bubbleParams.x;
                        lastY = bubbleParams.y;
                        downRawX = event.getRawX();
                        downRawY = event.getRawY();
                        moved = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = event.getRawX() - downRawX;
                        float dy = event.getRawY() - downRawY;
                        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
                        bubbleParams.x = lastX + Math.round(dx);
                        bubbleParams.y = lastY + Math.round(dy);
                        windowManager.updateViewLayout(bubbleView, bubbleParams);
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!moved) openSnip();
                        return true;
                    default:
                        return false;
                }
            }
        });

        bubbleView = bubble;
        windowManager.addView(bubbleView, bubbleParams);
        applyBubbleVisibility(bubbleVisible);
    }

    private void openSnip() {
        Intent intent = new Intent(this, SnipRegionActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
    }

    private void removeBubble() {
        if (bubbleView != null && windowManager != null) {
            try {
                windowManager.removeView(bubbleView);
            } catch (Exception ignored) {}
        }
        bubbleView = null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Velo snip",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Floating address snip");
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(
            this,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Velo snip on")
            .setContentText("Tap the V bubble over WhatsApp to snip an address")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pi)
            .setOngoing(true)
            .build();
    }

    private int dp(int value) {
        float d = getResources().getDisplayMetrics().density;
        return Math.round(value * d);
    }
}
