// Run with the installed Sharp package: node scripts/render-brand-icons.mjs <sharp-module-path>
import {readFile, writeFile, readdir} from 'node:fs/promises';
const {default: sharp} = await import(process.argv[2] || 'sharp');
const source = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
// Installed icons are opaque; each operating system applies its own corner mask.
const opaque = Buffer.from(source.replace('rx="128"', 'rx="0"'));
for (const size of [180, 192, 512]) {
  await sharp(opaque).resize(size, size).png().toFile(new URL(`../public/icons/eedoo-loop-${size}.png`, import.meta.url).pathname);
}
await writeFile(new URL('../public/icons/eedoo-loop.svg', import.meta.url), source.replace('rx="128"', 'rx="0"'));
// Raster favicon fallbacks are needed by browser UI that cannot decode SVG icons.
for (const size of [16, 32, 48]) {
  await sharp(opaque).resize(size, size).png().toFile(new URL(`../public/icons/eedoo-loop-${size}.png`, import.meta.url).pathname);
}
// ICO container with PNG frames; include a high-resolution frame for shortcuts.
const frames = await Promise.all([16, 32, 48, 256].map(size => sharp(opaque).resize(size, size).png().toBuffer().then(data => ({size, data}))));
const directory = Buffer.alloc(6 + 16 * frames.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(frames.length, 4);
let offset = directory.length;
frames.forEach(({size, data}, index) => {
  const entry = 6 + index * 16;
  directory[entry] = size === 256 ? 0 : size;
  directory[entry + 1] = size === 256 ? 0 : size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(data.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});
await writeFile(new URL('../public/favicon.ico', import.meta.url), Buffer.concat([directory, ...frames.map(frame => frame.data)]));
await writeFile(new URL('../public/favicon.png', import.meta.url), await readFile(new URL('../public/icons/eedoo-loop-192.png', import.meta.url)));
for (const name of ['eedoo-apple-touch-icon-v2.png', 'apple-touch-icon.png', 'apple-touch-icon-precomposed.png']) {
  await writeFile(new URL(`../public/${name}`, import.meta.url), await readFile(new URL('../public/icons/eedoo-loop-180.png', import.meta.url)));
}
// Legacy URLs remain valid for existing installations, with the same new mark.
for (const size of [180, 192, 512]) {
  await writeFile(new URL(`../public/icons/icon-${size}.png`, import.meta.url), await readFile(new URL(`../public/icons/eedoo-loop-${size}.png`, import.meta.url)));
}
// iOS displays these native startup images before the photo launch screen loads.
// Keep every supported device/orientation, replacing the obsolete green compass.
const mark = source.match(/<path[^>]+\/>/)[0];
for (const file of await readdir(new URL('../public/splash/', import.meta.url))) {
  if (!file.endsWith('.png')) continue;
  const output = new URL(`../public/splash/${file}`, import.meta.url);
  const [logicalWidth, logicalHeight, scale] = file.split('-').slice(0, 3).map(Number);
  const landscape = file.includes('landscape');
  const width = (landscape ? logicalHeight : logicalWidth) * scale;
  const height = (landscape ? logicalWidth : logicalHeight) * scale;
  const unit = Math.min(width, height);
  const size = Math.round(unit * .26);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#315e7d"/><svg x="${(width-size)/2}" y="${height*.44-size/2}" width="${size}" height="${size}" viewBox="0 0 512 512">${mark}</svg><text x="50%" y="${height*.44+size*.85}" text-anchor="middle" fill="#f4f7f8" font-family="sans-serif" font-size="${unit*.075}" font-weight="500">eedoo</text></svg>`;
  await sharp(Buffer.from(svg)).png({palette:true}).toFile(output.pathname + '.tmp');
  await writeFile(output, await readFile(output.pathname + '.tmp'));
  const {unlink} = await import('node:fs/promises');
  await unlink(output.pathname + '.tmp');
}
