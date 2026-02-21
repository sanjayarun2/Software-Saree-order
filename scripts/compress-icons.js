/**
 * Compress Android app icon and splash PNGs to reduce APK size.
 * Uses lossless PNG compression (compressionLevel 9 + adaptiveFiltering).
 * Run: npm run compress:icons
 */

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const RES_DIR = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

function getAllPngs(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) getAllPngs(full, files);
    else if (e.name.endsWith('.png')) files.push(full);
  }
  return files;
}

async function compressFile(filePath) {
  const before = fs.statSync(filePath).size;
  const buf = await sharp(filePath)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const after = buf.length;
  if (after < before) fs.writeFileSync(filePath, buf);
  return { before, after: after < before ? after : before };
}

async function main() {
  const pngs = getAllPngs(RES_DIR);
  if (!pngs.length) {
    console.log('No PNGs found in', RES_DIR);
    return;
  }
  console.log('Compressing', pngs.length, 'PNG(s)...\n');
  let totalBefore = 0;
  let totalAfter = 0;
  for (const filePath of pngs) {
    try {
      const { before, after } = await compressFile(filePath);
      totalBefore += before;
      totalAfter += after;
      const rel = path.relative(RES_DIR, filePath);
      const saved = ((1 - after / before) * 100).toFixed(1);
      console.log(rel, (before / 1024).toFixed(1), 'KB ->', (after / 1024).toFixed(1), 'KB', '(' + saved + '% smaller)');
    } catch (err) {
      console.error('Error:', filePath, err.message);
    }
  }
  const saved = totalBefore - totalAfter;
  const pct = totalBefore ? ((saved / totalBefore) * 100).toFixed(1) : 0;
  console.log('\nTotal:', (totalBefore / 1024).toFixed(1), 'KB ->', (totalAfter / 1024).toFixed(1), 'KB');
  console.log('Saved:', (saved / 1024).toFixed(1), 'KB (' + pct + '%)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
