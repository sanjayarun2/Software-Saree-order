"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import {
  BarcodeScanner,
  type Barcode,
  LensFacing,
  BarcodeFormat,
} from "@capacitor-mlkit/barcode-scanning";

export interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
}

const BODY_SCANNER_CLASS = "barcode-scanner-active";

type ScanState = "starting" | "scanning" | "denied" | "no-camera" | "error";

function getBarcodeText(barcode: Barcode): string {
  return barcode.displayValue ?? barcode.rawValue ?? "";
}

export function BarcodeScannerModal({ open, onClose, onResult }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const rafRef = useRef<number>(0);
  const doneRef = useRef(false);

  const [scanState, setScanState] = useState<ScanState>("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const isNative = typeof window !== "undefined" && Capacitor.isNativePlatform();

  const stopWebScan = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    detectorRef.current = null;
    const s = streamRef.current;
    streamRef.current = null;
    if (s) s.getTracks().forEach((t) => t.stop());
  }, []);

  const stopNativeScan = useCallback(async () => {
    try {
      document.body.classList.remove(BODY_SCANNER_CLASS);
      await BarcodeScanner.removeAllListeners();
      await BarcodeScanner.stopScan();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) {
      if (isNative) stopNativeScan();
      else stopWebScan();
      return;
    }

    doneRef.current = false;
    setScanState("starting");
    setErrorMsg("");
    setTorchOn(false);
    setTorchAvailable(false);

    let cancelled = false;

    if (isNative) {
      const run = async () => {
        try {
          const { camera } = await BarcodeScanner.checkPermissions();
          if (cancelled) return;
          if (camera !== "granted" && camera !== "limited") {
            const { camera: after } = await BarcodeScanner.requestPermissions();
            if (cancelled) return;
            if (after !== "granted" && after !== "limited") {
              setScanState("denied");
              setErrorMsg(
                "Camera permission is required. Please allow camera access in app settings and try again."
              );
              return;
            }
          }

          document.body.classList.add(BODY_SCANNER_CLASS);

          const listener = await BarcodeScanner.addListener(
            "barcodesScanned",
            (event: { barcodes: Barcode[] }) => {
              if (cancelled || doneRef.current) return;
              const barcodes = event.barcodes ?? [];
              const first = barcodes[0];
              if (first) {
                const text = getBarcodeText(first);
                if (text) {
                  doneRef.current = true;
                  onResult(text);
                  onClose();
                }
              }
            }
          );

          await BarcodeScanner.startScan({
            lensFacing: LensFacing.Back,
            formats: [
              BarcodeFormat.QrCode,
              BarcodeFormat.Code128,
              BarcodeFormat.Code39,
              BarcodeFormat.Ean13,
              BarcodeFormat.Ean8,
              BarcodeFormat.UpcA,
              BarcodeFormat.Itf,
              BarcodeFormat.Codabar,
            ],
          });

          if (cancelled) return;
          setScanState("scanning");

          try {
            const { available } = await BarcodeScanner.isTorchAvailable();
            if (!cancelled) setTorchAvailable(available);
          } catch {
            /* ignore */
          }

          return () => {
            listener.remove();
          };
        } catch (err) {
          if (!cancelled) {
            await stopNativeScan();
            setScanState("error");
            setErrorMsg((err as Error)?.message ?? "Failed to start scanner.");
          }
        }
      };

      run();

      return () => {
        cancelled = true;
        stopNativeScan();
      };
    }

    // Web: Barcode Detection API + getUserMedia
    const runWeb = async () => {
      try {
        await import("barcode-detector/polyfill");
      } catch {
        /* polyfill optional if browser supports BarcodeDetector */
      }

      if (cancelled) return;

      let stream: MediaStream | null = null;
      const constraints: MediaStreamConstraints[] = [
        { video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } },
        { video: { facingMode: "environment" } },
        { video: true },
      ];

      for (const c of constraints) {
        if (cancelled) return;
        try {
          stream = await navigator.mediaDevices.getUserMedia(c);
          break;
        } catch (err) {
          const name = (err as DOMException)?.name;
          if (name === "NotAllowedError" || name === "PermissionDeniedError") {
            if (!cancelled) {
              setScanState("denied");
              setErrorMsg(
                "Camera permission was denied. Allow camera for this site in browser settings and try again."
              );
            }
            return;
          }
          if (name === "NotFoundError") {
            if (!cancelled) {
              setScanState("no-camera");
              setErrorMsg("No camera found.");
            }
            return;
          }
        }
      }

      if (cancelled || !stream) {
        stream?.getTracks().forEach((t) => t.stop());
        if (!cancelled && !stream) {
          setScanState("error");
          setErrorMsg("Could not access camera.");
        }
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video || cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        if (!cancelled) {
          setScanState("error");
          setErrorMsg("Could not start video.");
        }
        return;
      }

      if (cancelled) return;

      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const caps = track.getCapabilities?.();
          if (caps && "torch" in caps) setTorchAvailable(true);
        } catch {
          /* ignore */
        }
      }

      setScanState("scanning");

      try {
        const detector = new (window as unknown as { BarcodeDetector: typeof BarcodeDetector }).BarcodeDetector({
          formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "itf", "codabar"],
        });
        detectorRef.current = detector;
      } catch {
        if (!cancelled) {
          setScanState("error");
          setErrorMsg("Barcode detection not supported in this browser.");
        }
        return;
      }

      const detectLoop = async () => {
        if (cancelled || doneRef.current || !detectorRef.current || !videoRef.current) return;
        try {
          const barcodes = await detectorRef.current.detect(videoRef.current);
          if (barcodes?.length && barcodes[0].rawValue) {
            doneRef.current = true;
            onResult(barcodes[0].rawValue);
            onClose();
            return;
          }
        } catch {
          /* no barcode in frame */
        }
        rafRef.current = requestAnimationFrame(detectLoop);
      };

      rafRef.current = requestAnimationFrame(detectLoop);
    };

    runWeb();

    return () => {
      cancelled = true;
      stopWebScan();
    };
  }, [open, retryKey, isNative, onResult, onClose, stopNativeScan, stopWebScan]);

  const toggleTorch = useCallback(async () => {
    if (isNative) {
      try {
        await BarcodeScanner.toggleTorch();
        setTorchOn((v) => !v);
      } catch {
        /* ignore */
      }
      return;
    }
    const s = streamRef.current;
    if (!s) return;
    const track = s.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
      });
      setTorchOn((v) => !v);
    } catch {
      /* ignore */
    }
  }, [torchOn, isNative]);

  const handleRetry = useCallback(() => {
    if (isNative) stopNativeScan();
    else stopWebScan();
    setScanState("starting");
    setErrorMsg("");
    setRetryKey((k) => k + 1);
  }, [isNative, stopNativeScan, stopWebScan]);

  if (!open) return null;

  const showError = scanState === "denied" || scanState === "no-camera" || scanState === "error";

  return (
    <div className={`barcode-scanner-modal fixed inset-0 z-[200] flex flex-col ${isNative ? "bg-transparent" : "bg-black"}`}>
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
        <h2 className="text-lg font-semibold text-white">Scan Barcode</h2>
        {torchAvailable ? (
          <button type="button" onClick={toggleTorch} className={`flex h-10 w-10 items-center justify-center rounded-full ${torchOn ? "bg-primary-500 text-white" : "bg-white/10 text-white"}`} aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
          </button>
        ) : (
          <div className="h-10 w-10" />
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {!isNative && <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />}

        {scanState === "scanning" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[55%] w-[80%] max-w-sm">
              <div className="absolute inset-0 rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
              <div className="absolute left-0 top-0 h-6 w-6 border-l-4 border-t-4 border-primary-400 rounded-tl-lg" />
              <div className="absolute right-0 top-0 h-6 w-6 border-r-4 border-t-4 border-primary-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 h-6 w-6 border-b-4 border-l-4 border-primary-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 h-6 w-6 border-b-4 border-r-4 border-primary-400 rounded-br-lg" />
            </div>
          </div>
        )}

        {scanState === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
            <div className="h-8 w-8 rounded-full border-[3px] border-white/20 border-t-white" style={{ animation: "spin 0.8s linear infinite" }} />
            <p className="text-sm font-medium text-white/80">Starting camera…</p>
          </div>
        )}

        {showError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/95 px-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="1" y1="1" x2="23" y2="23" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div className="max-w-sm text-center">
              <p className="text-base font-semibold text-white">
                {scanState === "denied" ? "Camera Access Needed" : scanState === "no-camera" ? "No Camera Found" : "Camera Error"}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/70">{errorMsg}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button type="button" onClick={handleRetry} className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white">Try again</button>
              <button type="button" onClick={onClose} className="rounded-xl bg-white/15 px-5 py-2.5 text-sm font-semibold text-white">Close</button>
            </div>
          </div>
        )}
      </div>

      {scanState === "scanning" && (
        <div className="shrink-0 px-4 pb-6 pt-3 text-center">
          <p className="text-sm text-white/80">Point camera at barcode or QR code</p>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        body.barcode-scanner-active {
          visibility: hidden;
        }
        body.barcode-scanner-active .barcode-scanner-modal {
          visibility: visible;
        }
      `}</style>
    </div>
  );
}
