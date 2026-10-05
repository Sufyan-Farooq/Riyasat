import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Keep all raster icons in sync with the browser's vector icon.
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('app/icon.svg', root), 'utf8');
const square = source.replace('rx="12"', 'rx="0"');
const maskable = square.replace('translate(11 9) scale(1.75)', 'translate(16.4 15.2) scale(1.3)');
await mkdir(new URL('public/icons/', root), { recursive: true });

for (const size of [192, 512]) {
  await writeFile(new URL(`public/icons/icon-${size}.png`, root), await sharp(Buffer.from(source)).resize(size, size).png().toBuffer());
}
await writeFile(new URL('app/apple-icon.png', root), await sharp(Buffer.from(square)).resize(180, 180).png().toBuffer());
await writeFile(new URL('public/icons/icon-maskable-512.png', root), await sharp(Buffer.from(maskable)).resize(512, 512).png().toBuffer());

// An ICO directory can contain PNG images; include the common tab sizes.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(Buffer.from(source)).resize(size, size).png().toBuffer()));
const directory = Buffer.alloc(6 + 16 * images.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);
let offset = directory.length;
images.forEach((image, index) => {
  const entry = 6 + 16 * index;
  directory[entry] = sizes[index];
  directory[entry + 1] = sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(image.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(new URL('app/favicon.ico', root), Buffer.concat([directory, ...images]));
