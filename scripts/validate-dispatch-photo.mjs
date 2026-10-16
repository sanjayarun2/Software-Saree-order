/**
 * Optional dispatch photo — additive only; barcode/tracking stay as before.
 * Run: node scripts/validate-dispatch-photo.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(p) {
  return readFileSync(resolve(root, p), "utf8");
}

function check(label, fn) {
  fn();
  console.log(`OK: ${label}`);
}

const storage = read("src/lib/dispatch-photo-storage.ts");
const capture = read("src/lib/dispatch-photo-capture.ts");
const orders = read("src/app/orders/page.tsx");
const detail = read("src/components/orders/OrderDetailSheet.tsx");
const scanner = read("src/components/ui/BarcodeScannerModal.tsx");

check("local IDB helpers exist (no orders-table column required)", () => {
  assert.match(storage, /export async function saveDispatchPhoto/);
  assert.match(storage, /export async function getDispatchPhoto/);
  assert.match(storage, /export async function deleteDispatchPhoto/);
  assert.match(storage, /saree-dispatch-photos/);
});

check("capture is separate from barcode scanner", () => {
  assert.match(capture, /captureDispatchPhotoNative/);
  assert.match(capture, /captureDispatchPhotoFromFile/);
  assert.match(capture, /CameraSource\.Camera/);
  assert.match(capture, /DISPATCH_PHOTO_PROFILE/);
  assert.doesNotMatch(capture, /BarcodeScanner/);
});

check("Move to Dispatch keeps optional tracking + barcode unchanged", () => {
  assert.match(orders, /Tracking \/ Consignment \/ LR Number \(optional\)/);
  assert.match(orders, /trackingNumber\.trim\(\) \|\| null/);
  assert.match(orders, /setScannerOpen\(true\)/);
  assert.match(orders, /BarcodeScannerModal/);
  assert.match(scanner, /export function BarcodeScannerModal/);
});

check("optional Add photo is additive in the same popup", () => {
  assert.match(orders, /Dispatch photo \(optional\)/);
  assert.match(orders, /Add photo/);
  assert.match(orders, /pickDispatchPhoto/);
  assert.match(orders, /saveDispatchPhoto/);
  assert.match(orders, /if \(dispatchPhoto\)/);
});

check("dispatch still works without photo or tracking", () => {
  assert.match(orders, /disabled=\{dispatching \|\| dispatchPhotoBusy\}/);
  // Dispatch button is not gated on trackingNumber or dispatchPhoto presence
  assert.doesNotMatch(
    orders,
    /disabled=\{[^}]*!trackingNumber/
  );
  assert.doesNotMatch(
    orders,
    /disabled=\{[^}]*!dispatchPhoto/
  );
});

check("photo cleared on delete / move to pending", () => {
  assert.match(orders, /await deleteDispatchPhoto\(user\.id, id\)/);
  assert.match(orders, /await deleteDispatchPhoto\(user\.id, order\.id\)/);
});

check("order detail can show dispatch photo", () => {
  assert.match(detail, /getDispatchPhoto/);
  assert.match(detail, /dispatchPhotoUrl/);
  assert.match(detail, /dispatchPhoto: t\("Dispatch photo"\)/);
});

console.log("All dispatch-photo checks passed.");
