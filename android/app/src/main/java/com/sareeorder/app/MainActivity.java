package com.sareeorder.app;

import com.getcapacitor.BridgeActivity;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;

/**
 * Required by @capgo/capacitor-social-login when using Google scopes or offline mode.
 * Marker interface — no extra logic needed for online ID-token sign-in.
 */
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Intentionally empty — satisfies plugin contract.
    }
}
