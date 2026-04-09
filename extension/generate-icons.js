/**
 * Generates simple placeholder PNG icons for the SnapTrade Chrome extension.
 * Uses only built-in Node.js modules (no canvas dependency).
 *
 * Creates solid purple (#7C4DFF) squares with a lighter center region
 * at 16x16, 32x32, 48x48, and 128x128 pixel sizes.
 *
 * Output: assets/icon-16.png, assets/icon-32.png, assets/icon-48.png, assets/icon-128.png
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZES = [16, 32, 48, 128];
const ASSETS_DIR = path.join(__dirname, "assets");

// Colors (RGBA)
const PURPLE = { r: 124, g: 77, b: 255, a: 255 };       // #7C4DFF
const LIGHT_PURPLE = { r: 179, g: 157, b: 255, a: 255 }; // lighter center
const DARK_PURPLE = { r: 88, g: 34, b: 200, a: 255 };    // bolt outline

function createCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
}

const CRC_TABLE = createCrc32Table();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBytes, data]);
  const crcValue = crc32(crcInput);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcValue, 0);

  return Buffer.concat([length, typeBytes, data, crcBuf]);
}

function isInsideLightningBolt(x, y, size) {
  // Normalize coordinates to 0-1 range
  const nx = x / size;
  const ny = y / size;

  // Define a simple lightning bolt shape using polygon regions
  // The bolt goes from top-center down-left, then jags right, then down-left again
  const margin = 0.15;

  // Check if inside the icon area (with margin)
  if (nx < margin || nx > 1 - margin || ny < margin || ny > 1 - margin) {
    return false;
  }

  // Lightning bolt as a series of horizontal bands with x-ranges
  // Top section (ny 0.15 to 0.45): widens from right to center-left
  if (ny >= 0.15 && ny < 0.45) {
    const t = (ny - 0.15) / 0.30;
    const leftEdge = 0.30 - t * 0.10;
    const rightEdge = 0.65 - t * 0.05;
    return nx >= leftEdge && nx <= rightEdge;
  }

  // Middle jag right (ny 0.45 to 0.55): shifts right
  if (ny >= 0.45 && ny < 0.55) {
    const leftEdge = 0.35;
    const rightEdge = 0.75;
    return nx >= leftEdge && nx <= rightEdge;
  }

  // Bottom section (ny 0.55 to 0.85): narrows from center to right
  if (ny >= 0.55 && ny <= 0.85) {
    const t = (ny - 0.55) / 0.30;
    const leftEdge = 0.40 + t * 0.10;
    const rightEdge = 0.70 - t * 0.05;
    return nx >= leftEdge && nx <= rightEdge;
  }

  return false;
}

function generateIcon(size) {
  // Raw image data: each row starts with a filter byte (0 = None), then RGBA pixels
  const rowSize = 1 + size * 4; // filter byte + RGBA per pixel
  const rawData = Buffer.alloc(rowSize * size);

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // filter type: None

    for (let x = 0; x < size; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;

      let color;
      if (isInsideLightningBolt(x, y, size)) {
        color = LIGHT_PURPLE;
      } else {
        // Check if near the bolt edge for a dark outline effect
        const nearBolt =
          isInsideLightningBolt(x - 1, y, size) ||
          isInsideLightningBolt(x + 1, y, size) ||
          isInsideLightningBolt(x, y - 1, size) ||
          isInsideLightningBolt(x, y + 1, size);

        if (nearBolt && size >= 32) {
          color = DARK_PURPLE;
        } else {
          color = PURPLE;
        }
      }

      rawData[pixelOffset] = color.r;
      rawData[pixelOffset + 1] = color.g;
      rawData[pixelOffset + 2] = color.b;
      rawData[pixelOffset + 3] = color.a;
    }
  }

  // Compress the raw image data
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  // Build PNG file
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk data: width(4) + height(4) + bitDepth(1) + colorType(1) + compression(1) + filter(1) + interlace(1)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData[8] = 8;                   // bit depth
  ihdrData[9] = 6;                   // color type: RGBA
  ihdrData[10] = 0;                  // compression method
  ihdrData[11] = 0;                  // filter method
  ihdrData[12] = 0;                  // interlace method

  const ihdrChunk = createPngChunk("IHDR", ihdrData);
  const idatChunk = createPngChunk("IDAT", compressed);
  const iendChunk = createPngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([PNG_SIGNATURE, ihdrChunk, idatChunk, iendChunk]);
}

// Ensure assets directory exists
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// Generate icons for each size
for (const size of SIZES) {
  const pngBuffer = generateIcon(size);
  const outputPath = path.join(ASSETS_DIR, `icon-${size}.png`);
  fs.writeFileSync(outputPath, pngBuffer);
  console.log(`Generated ${outputPath} (${pngBuffer.length} bytes, ${size}x${size}px)`);
}

console.log("All icons generated successfully.");
