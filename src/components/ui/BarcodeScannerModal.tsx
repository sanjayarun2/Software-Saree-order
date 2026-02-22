"use client";

import React, { useEffect, useRef, useState } from "react";

const SCANNER_ELEMENT_ID = "barcode-scanner-root";

export interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
}

export function BarcodeScannerModal({ open, onClose, onResult }: BarcodeScannerModalProps) {
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError(null);
    setStarting(true);
    setTorchOn(false);
    setTorchAvailable(false);

    const startScanner = async () => {
      const { Html5Qrcode: H5Q, Html5QrcodeSupportedFormats: F } = await import("html5-qrcode");
      const el = document.getElementById(SCANNER_ELEMENT_ID);
      if (!el || cancelled) return;

      const scanner = new H5Q(SCANNER_ELEMENT_ID, {
        formatsToSupport: [
          F.CODE_128,
          F.QR_CODE,
          F.CODE_39,
          F.EAN_13,
          F.UPC_A,
          F.ITF,
          F.CODABAR,
        ],
        verbose: false,
      });
      scannerRef.current = scanner;

      try {
        const cameras = await H5Q.getCameras();
        if (cancelled) {
          await scanner.stop();
          return;
        }
        const backCamera = cameras.find(
          (c) => c.label.toLowerCase().includes("back") || c.label.toLowerCase().includes("environment")
        );
        const cameraId = backCamera?.id ?? cameras[0]?.id;
        if (!cameraId) {
          setError("No camera found");
          setStarting(false);
          return;
        }

        await scanner.start(
          cameraId,
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
          },
          (decodedText) => {
            if (cancelled) return;
            onResult(decodedText);
            onClose();
          },
          () => {
            // Ignore decode errors (no code in frame)
          }
        );

        if (cancelled) {
          await scanner.stop();
          return;
        }

        setStarting(false);

        try {
          const caps = scanner.getRunningTrackCapabilities();
          const hasTorch = typeof (caps as MediaTrackCapabilities & { torch?: boolean }).torch === "boolean";
          setTorchAvailable(hasTorch);
        } catch {
          setTorchAvailable(false);
        }
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message || "Failed to start camera");
        setStarting(false);
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop().catch(() => {});
      }
    };
  }, [open, onClose, onResult]);

  const toggleTorch = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      await scanner.applyVideoConstraints({
        advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
      });
      setTorchOn((prev) => !prev);
    } catch {
      // Torch not supported or failed
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label="Close"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-white">Scan Barcode</h2>
        {torchAvailable ? (
          <button
            type="button"
            onClick={toggleTorch}
            className={`flex h-10 w-10 items-center justify-center rounded-full ${torchOn ? "bg-primary-500 text-white" : "bg-white/10 text-white hover:bg-white/20"}`}
            aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 2h6v1H9zM12 22v-5M9 17h6" />
              <path d="M9 6a3 3 0 016 0v5a3 3 0 01-6 0V6z" />
              <path d="M17 11a5 5 0 01-10 0" />
            </svg>
          </button>
        ) : (
          <div className="h-10 w-10" />
        )}
      </div>

      {/* Camera + viewfinder */}
      <div className="relative min-h-0 flex-1">
        <div id={SCANNER_ELEMENT_ID} className="h-full w-full" />
        {/* Scanning frame overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-[60%] w-[85%] max-w-sm">
            <div className="absolute inset-0 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]" />
            <div className="absolute inset-0 overflow-hidden rounded-2xl">
              <div className="absolute left-0 right-0 h-1 animate-scan-line rounded-full bg-primary-400/90" />
            </div>
          </div>
        </div>
        {starting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-sm font-medium text-white">Starting camera…</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 px-4">
            <p className="text-center text-sm text-red-300">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/30"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Bottom instruction */}
      <div className="shrink-0 px-4 pb-6 pt-2 text-center">
        <p className="text-sm text-white/80">Point camera at barcode or QR code</p>
      </div>
    </div>
  );
}
