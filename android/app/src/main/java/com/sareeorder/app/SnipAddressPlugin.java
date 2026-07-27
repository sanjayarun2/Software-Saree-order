package com.sareeorder.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SnipAddress")
public class SnipAddressPlugin extends Plugin {
    public static SnipAddressPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    public void notifySnipText(String text) {
        if (text == null || text.trim().isEmpty()) return;
        JSObject data = new JSObject();
        data.put("text", text.trim());
        notifyListeners("snipAddress", data);
    }

    @PluginMethod
    public void hasOverlayPermission(PluginCall call) {
        JSObject data = new JSObject();
        data.put("granted", SnipOverlayService.canDrawOverlays(getContext()));
        call.resolve(data);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        try {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject data = new JSObject();
            data.put("opened", true);
            call.resolve(data);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Could not open settings");
        }
    }

    @PluginMethod
    public void startOverlay(PluginCall call) {
        if (!SnipOverlayService.canDrawOverlays(getContext())) {
            call.reject("Overlay permission required");
            return;
        }
        Intent intent = new Intent(getContext(), SnipOverlayService.class);
        intent.setAction(SnipOverlayService.ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        JSObject data = new JSObject();
        data.put("running", true);
        call.resolve(data);
    }

    @PluginMethod
    public void stopOverlay(PluginCall call) {
        Intent intent = new Intent(getContext(), SnipOverlayService.class);
        intent.setAction(SnipOverlayService.ACTION_STOP);
        getContext().startService(intent);
        getContext().stopService(new Intent(getContext(), SnipOverlayService.class));
        JSObject data = new JSObject();
        data.put("running", false);
        call.resolve(data);
    }

    @PluginMethod
    public void isOverlayRunning(PluginCall call) {
        JSObject data = new JSObject();
        data.put("running", SnipOverlayService.isRunning());
        call.resolve(data);
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        String text = SnipAddressHolder.consume();
        JSObject data = new JSObject();
        data.put("text", text != null ? text : "");
        call.resolve(data);
    }
}
