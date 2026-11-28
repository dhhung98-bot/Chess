import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const table = await readFile(resolve(root, 'shared/krk-table.bin'));
if (table.length !== 2 * 64 ** 3) throw new Error('Invalid KRK tablebase');
const api = new URL(process.env.CHESS_API_URL || 'http://localhost:8787');
if (!['http:', 'https:'].includes(api.protocol)) throw new Error('The chess API needs an HTTP(S) URL');

// Choose a reproducible sample of positions for each supported distance.
const banks = Object.fromEntries([1, 3, 5, 7, 9, 11, 13, 15, 17].map(distance => [distance, []]));
const counts = new Uint32Array(18);
let seed = 0x6da9b2c3;
for (let index = 0; index < table.length / 2; index++) {
  const distance = table[index * 2];
  const bank = banks[distance];
  if (!bank) continue;
  const seen = ++counts[distance];
  if (bank.length < 72) {
    bank.push(index);
    continue;
  }
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  const slot = (seed >>> 0) % seen;
  if (slot < bank.length) bank[slot] = index;
}
const bankModule = `export const banks = ${JSON.stringify(banks)};\n`;
await writeFile(resolve(root, 'backend/src/generated-table.mjs'),
  `${bankModule}const encoded = '${table.toString('base64')}';\n`
  + `const bytes = atob(encoded);\nexport const table = new Uint8Array(bytes.length);\n`
  + `for (let i = 0; i < bytes.length; i++) table[i] = bytes.charCodeAt(i);\n`);

const dist = resolve(root, 'frontend/dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, 'frontend/public'), dist, { recursive: true });
await Promise.all([
  cp(resolve(root, 'node_modules/chess.js/dist/esm/chess.js'), resolve(dist, 'chess.mjs')),
  cp(resolve(root, 'node_modules/chess.js/LICENSE'), resolve(dist, 'chess-license.txt')),
  cp(resolve(root, 'shared/krk.mjs'), resolve(dist, 'krk.mjs')),
  writeFile(resolve(dist, 'krk-table.bin'), table),
  writeFile(resolve(dist, 'positions.mjs'), bankModule),
  writeFile(resolve(dist, 'config.mjs'),
    `export const apiBase = ${JSON.stringify(api.origin)};\n`),
  writeFile(resolve(dist, '_headers'), `/*
  Content-Security-Policy: default-src 'self'; connect-src 'self' ${api.origin}; base-uri 'none'; frame-ancestors 'none'; object-src 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
`),
]);
