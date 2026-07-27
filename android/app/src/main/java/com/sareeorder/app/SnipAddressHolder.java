package com.sareeorder.app;

/** Holds OCR / snip text until JS consumes it. */
public final class SnipAddressHolder {
    private static String pending;

    private SnipAddressHolder() {}

    public static synchronized void set(String text) {
        pending = text;
    }

    public static synchronized String consume() {
        String value = pending;
        pending = null;
        return value;
    }
}
