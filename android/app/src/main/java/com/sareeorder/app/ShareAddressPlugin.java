package com.sareeorder.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ShareAddress")
public class ShareAddressPlugin extends Plugin {
    public static ShareAddressPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }

    public void notifySharedText(String text) {
        if (text == null || text.trim().isEmpty()) return;
        JSObject data = new JSObject();
        data.put("text", text.trim());
        notifyListeners("shareAddress", data);
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        String text = ShareAddressHolder.consume();
        JSObject data = new JSObject();
        data.put("text", text != null ? text : "");
        call.resolve(data);
    }
}
