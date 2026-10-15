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
