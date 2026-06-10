/**
 * Generates a short two-tone "cling" WAV for Android notification sound (res/raw).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleRate = 22050;
const durationSec = 0.45;

function toneSample(freq, t, attack = 0.012, decay = 0.2) {
  const env =
    t < attack ? t / attack : Math.exp(-(t - attack) / decay);
  return Math.sin(2 * Math.PI * freq * t) * env * 0.55;
}

function writeWav(filePath, samples) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.floor(clamped * 32767), 44 + i * 2);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

const totalSamples = Math.floor(sampleRate * durationSec);
const samples = new Float32Array(totalSamples);

for (let i = 0; i < totalSamples; i++) {
  const t = i / sampleRate;
  const first = toneSample(1046.5, t, 0.008, 0.14);
  const second = t > 0.11 ? toneSample(1318.5, t - 0.11, 0.006, 0.22) : 0;
  samples[i] = first + second;
}

const outDir = path.join(__dirname, "..", "android", "app", "src", "main", "res", "raw");
writeWav(path.join(outDir, "order_cling.wav"), samples);

const publicDir = path.join(__dirname, "..", "public", "sounds");
writeWav(path.join(publicDir, "order-cling.wav"), samples);

console.log("Wrote order cling WAV to android res/raw and public/sounds");
