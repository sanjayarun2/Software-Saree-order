/**
 * Meta JS SDK + WhatsApp Embedded Signup helpers for the browser.
 * Secrets stay server-side; only App ID + Configuration ID are public.
 */

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (
        cb: (response: { authResponse?: { code?: string } }) => void,
        opts: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

export type EmbeddedSignupSession = {
  code: string;
  waba_id: string;
  phone_number_id: string;
  phone_number?: string;
};

type SessionPartial = {
  code?: string;
  waba_id?: string;
  phone_number_id?: string;
  phone_number?: string;
};

let sdkPromise: Promise<void> | null = null;

export function getPublicMetaConfig(): { appId: string; configId: string } {
  return {
    appId: (process.env.NEXT_PUBLIC_META_APP_ID ?? "").trim(),
    configId: (process.env.NEXT_PUBLIC_WA_ES_CONFIG_ID ?? "").trim(),
  };
}

export function loadFacebookSdk(appId: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Facebook SDK requires a browser."));
  }
  if (!appId) {
    return Promise.reject(
      new Error("NEXT_PUBLIC_META_APP_ID is not set. Ask an admin to configure Meta Embedded Signup.")
    );
  }
  if (window.FB) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      try {
        window.FB?.init({
          appId,
          cookie: true,
          xfbml: false,
          version: "v25.0",
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    };

    if (document.getElementById("facebook-jssdk")) {
      // Script tag exists; fbAsyncInit may have already run or will soon.
      const started = Date.now();
      const wait = () => {
        if (window.FB) {
          window.FB.init({
            appId,
            cookie: true,
            xfbml: false,
            version: "v25.0",
          });
          resolve();
          return;
        }
        if (Date.now() - started > 15000) {
          reject(new Error("Facebook SDK failed to load."));
          return;
        }
        window.setTimeout(wait, 100);
      };
      wait();
      return;
    }

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => reject(new Error("Could not load Facebook SDK."));
    document.body.appendChild(script);
  });

  return sdkPromise;
}

/**
 * Launches Embedded Signup and resolves with code + WABA/phone ids.
 * Meta may deliver ids via postMessage and the auth code via FB.login callback.
 */
export function launchWhatsAppEmbeddedSignup(
  configId: string
): Promise<EmbeddedSignupSession> {
  if (!configId) {
    return Promise.reject(
      new Error(
        "NEXT_PUBLIC_WA_ES_CONFIG_ID is not set. Create a WhatsApp Embedded Signup configuration in Meta and add the Configuration ID."
      )
    );
  }
  if (!window.FB) {
    return Promise.reject(new Error("Facebook SDK is not ready."));
  }

  return new Promise((resolve, reject) => {
    const partial: SessionPartial = {};
    let settled = false;

    const finishIfReady = () => {
      if (settled) return;
      if (partial.code && partial.waba_id && partial.phone_number_id) {
        settled = true;
        window.removeEventListener("message", onMessage);
        resolve({
          code: partial.code,
          waba_id: partial.waba_id,
          phone_number_id: partial.phone_number_id,
          phone_number: partial.phone_number,
        });
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (!isMetaOrigin(event.origin)) return;
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;
        const payload = data.data ?? data;
        if (payload?.waba_id) partial.waba_id = String(payload.waba_id);
        if (payload?.phone_number_id) {
          partial.phone_number_id = String(payload.phone_number_id);
        }
        if (payload?.phone_number) {
          partial.phone_number = String(payload.phone_number);
        }
        // Some payloads nest under event/data
        const nested = payload?.data ?? payload?.event;
        if (nested?.waba_id) partial.waba_id = String(nested.waba_id);
        if (nested?.phone_number_id) {
          partial.phone_number_id = String(nested.phone_number_id);
        }
        finishIfReady();
      } catch {
        /* ignore non-JSON */
      }
    };

    window.addEventListener("message", onMessage);

    window.setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      reject(
        new Error(
          "WhatsApp signup timed out. Complete the Meta popup, then try again."
        )
      );
    }, 5 * 60 * 1000);

    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          if (!settled) {
            settled = true;
            window.removeEventListener("message", onMessage);
            reject(new Error("WhatsApp signup was cancelled or failed."));
          }
          return;
        }
        partial.code = code;
        finishIfReady();
        // If message event already arrived, finishIfReady resolved.
        // If not, wait a bit for WA_EMBEDDED_SIGNUP postMessage.
        window.setTimeout(() => {
          if (settled) return;
          if (!partial.waba_id || !partial.phone_number_id) {
            settled = true;
            window.removeEventListener("message", onMessage);
            reject(
              new Error(
                "Meta did not return WhatsApp account ids. Ensure Embedded Signup is configured and try again."
              )
            );
          }
        }, 8000);
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "",
          sessionInfoVersion: "3",
        },
      }
    );
  });
}

function isMetaOrigin(origin: string): boolean {
  return (
    origin === "https://www.facebook.com" ||
    origin === "https://web.facebook.com" ||
    origin.endsWith(".facebook.com") ||
    origin === "https://www.instagram.com"
  );
}
