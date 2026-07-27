package com.sareeorder.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;

/**
 * Required by @capgo/capacitor-social-login when using Google scopes or offline mode.
 * Also receives ACTION_SEND text shares (e.g. WhatsApp address → Add Order).
 */
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareAddressPlugin.class);
        registerPlugin(SnipAddressPlugin.class);
        super.onCreate(savedInstanceState);
        handleSendIntent(getIntent());
        handleSnipExtra(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleSendIntent(intent);
        handleSnipExtra(intent);
    }

    private void handleSnipExtra(Intent intent) {
        if (intent == null) return;
        String snip = intent.getStringExtra("snip_text");
        if (snip == null || snip.trim().isEmpty()) return;
        intent.removeExtra("snip_text");
        String text = snip.trim();
        SnipAddressHolder.set(text);
        if (SnipAddressPlugin.instance != null) {
            SnipAddressPlugin.instance.notifySnipText(text);
        }
    }

    private void handleSendIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();
        if (!Intent.ACTION_SEND.equals(action) || type == null) return;
        if (!type.startsWith("text/")) return;

        String shared = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (shared == null || shared.trim().isEmpty()) {
            shared = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        }
        if (shared == null || shared.trim().isEmpty()) return;

        String text = shared.trim();
        ShareAddressHolder.set(text);
        if (ShareAddressPlugin.instance != null) {
            ShareAddressPlugin.instance.notifySharedText(text);
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Intentionally empty — satisfies plugin contract.
    }
}
