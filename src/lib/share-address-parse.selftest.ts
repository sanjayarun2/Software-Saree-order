/**
 * Lightweight self-check for share/snip address parsing.
 * Run: npx --yes tsx src/lib/share-address-parse.selftest.ts
 */
import {
  customerNameFromAddress,
  extractMobileFromAddress,
  isProperAddressText,
  trimAddressText,
} from "./share-address-parse";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const block = trimAddressText("  Ravi Kumar\n12 Main St\nMob 9876543210  \n");
assert(block.startsWith("Ravi Kumar"), "trim keeps name");
assert(extractMobileFromAddress(block) === "9876543210", "extract mobile");
assert(customerNameFromAddress(block) === "Ravi Kumar", "customer name");
assert(extractMobileFromAddress("no phone") === "", "missing mobile");
assert(customerNameFromAddress("") === "Customer", "fallback name");

assert(isProperAddressText(block).ok === true, "proper address with mobile");
assert(isProperAddressText("hi").ok === false, "reject too short");
assert(isProperAddressText("||||||||||||||||").ok === false, "reject garbage");
assert(
  isProperAddressText("abc def ghi jkl mno").ok === false,
  "reject weak single-line without pin/mobile"
);

console.log("share-address-parse.selftest: ok");
