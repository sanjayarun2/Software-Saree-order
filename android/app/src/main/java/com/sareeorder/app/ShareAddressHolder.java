package com.sareeorder.app;

/** Holds text shared into the app until JS consumes it. */
public final class ShareAddressHolder {
    private static String pending;

    private ShareAddressHolder() {}

    public static synchronized void set(String text) {
        pending = text;
    }

    public static synchronized String peek() {
        return pending;
    }

    public static synchronized String consume() {
        String value = pending;
        pending = null;
        return value;
    }
}
