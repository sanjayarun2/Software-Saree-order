package com.sareeorder.app;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.RectF;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

/**
 * Capture screen → user crops address → OCR → hand text to JS via SnipAddressPlugin.
 */
public class SnipRegionActivity extends AppCompatActivity {
    private static final int REQ_CAPTURE = 4401;

    private ImageView preview;
    private SnipCropView cropView;
    private TextView hint;
    private Button useBtn;
    private boolean ocrRunning;
    private boolean receiverRegistered;

    private final BroadcastReceiver captureReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String action = intent.getAction();
            if (SnipMediaProjectionService.ACTION_CAPTURED.equals(action)) {
                Bitmap bitmap = SnipScreenshotHolder.get();
                if (bitmap == null || bitmap.isRecycled()) {
                    toast("Capture failed");
                    finishSnip(null);
                    return;
                }
                showScreenshot(bitmap);
            } else if (SnipMediaProjectionService.ACTION_FAILED.equals(action)) {
                String err = intent.getStringExtra(SnipMediaProjectionService.EXTRA_ERROR);
                toast(err != null ? err : "Capture failed");
                finishSnip(null);
            }
        }
    };

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_snip_region);

        preview = findViewById(R.id.snip_preview);
        cropView = findViewById(R.id.snip_crop);
        hint = findViewById(R.id.snip_hint);
        useBtn = findViewById(R.id.snip_use);
        Button cancelBtn = findViewById(R.id.snip_cancel);

        cancelBtn.setOnClickListener(v -> finishSnip(null));
        useBtn.setOnClickListener(v -> onUseClicked());
        useBtn.setEnabled(false);

        IntentFilter filter = new IntentFilter();
        filter.addAction(SnipMediaProjectionService.ACTION_CAPTURED);
        filter.addAction(SnipMediaProjectionService.ACTION_FAILED);
        ContextCompat.registerReceiver(
            this,
            captureReceiver,
            filter,
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
        receiverRegistered = true;

        Bitmap existing = SnipScreenshotHolder.get();
        if (existing != null && !existing.isRecycled()) {
            showScreenshot(existing);
        } else {
            requestCapturePermission();
        }
    }

    private void requestCapturePermission() {
        MediaProjectionManager mpm =
            (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        if (mpm == null) {
            toast("Screen capture unavailable");
            finishSnip(null);
            return;
        }
        hint.setText("Allow screen capture, then drag over the address");
        startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_CAPTURE) return;
        if (resultCode != Activity.RESULT_OK || data == null) {
            toast("Screen capture denied");
            finishSnip(null);
            return;
        }
        hint.setText("Capturing…");
        Intent svc = new Intent(this, SnipMediaProjectionService.class);
        svc.putExtra(SnipMediaProjectionService.EXTRA_RESULT_CODE, resultCode);
        svc.putExtra(SnipMediaProjectionService.EXTRA_DATA, data);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(svc);
        } else {
            startService(svc);
        }
    }

    private void showScreenshot(Bitmap bitmap) {
        preview.setImageBitmap(bitmap);
        cropView.clearSelection();
        useBtn.setEnabled(true);
        hint.setText("Drag to select address, then Use");
        SnipOverlayService.setBubbleVisible(false);
    }

    private void onUseClicked() {
        if (ocrRunning) return;
        Bitmap full = SnipScreenshotHolder.get();
        if (full == null || full.isRecycled()) {
            toast("No screenshot");
            return;
        }
        if (!cropView.hasSelection()) {
            toast("Drag to select the address area");
            return;
        }

        RectF sel = cropView.getSelection();
        int vw = cropView.getWidth();
        int vh = cropView.getHeight();
        if (vw <= 0 || vh <= 0) return;

        float scaleX = (float) full.getWidth() / (float) vw;
        float scaleY = (float) full.getHeight() / (float) vh;
        int left = Math.max(0, Math.round(sel.left * scaleX));
        int top = Math.max(0, Math.round(sel.top * scaleY));
        int right = Math.min(full.getWidth(), Math.round(sel.right * scaleX));
        int bottom = Math.min(full.getHeight(), Math.round(sel.bottom * scaleY));
        int w = right - left;
        int h = bottom - top;
        if (w < 8 || h < 8) {
            toast("Selection too small");
            return;
        }

        ocrRunning = true;
        useBtn.setEnabled(false);
        hint.setText("Reading text…");

        final Bitmap crop = Bitmap.createBitmap(full, left, top, w, h);
        new Thread(() -> {
            String text = "";
            String err = null;
            try {
                text = SnipOcrHelper.recognize(crop);
            } catch (Exception e) {
                err = e.getMessage() != null ? e.getMessage() : "OCR failed";
            } finally {
                if (!crop.isRecycled()) crop.recycle();
            }
            final String out = text;
            final String error = err;
            runOnUiThread(() -> {
                ocrRunning = false;
                if (error != null) {
                    toast(error);
                    useBtn.setEnabled(true);
                    hint.setText("Drag to select address, then Use");
                    return;
                }
                if (out == null || out.trim().isEmpty()) {
                    toast("No text found");
                    useBtn.setEnabled(true);
                    hint.setText("Drag to select address, then Use");
                    return;
                }
                finishSnip(out.trim());
            });
        }, "velo-snip-ocr").start();
    }

    private void finishSnip(@Nullable String text) {
        SnipScreenshotHolder.clear();
        SnipOverlayService.setBubbleVisible(true);
        if (text != null && !text.isEmpty()) {
            SnipAddressHolder.set(text);
            if (SnipAddressPlugin.instance != null) {
                SnipAddressPlugin.instance.notifySnipText(text);
            }
            Intent launch = new Intent(this, MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            launch.putExtra("snip_text", text);
            startActivity(launch);
        }
        finish();
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onDestroy() {
        if (receiverRegistered) {
            try {
                unregisterReceiver(captureReceiver);
            } catch (Exception ignored) {}
            receiverRegistered = false;
        }
        SnipOverlayService.setBubbleVisible(true);
        super.onDestroy();
    }
}
