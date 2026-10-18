import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const module = await require('./build/smac-map.cjs')();
const header = 15;
const tiles = header + 0xaa4;
const tileSize = 44;

// Synthetic, documented original-format records. No original game files are
// required or embedded. Default seed zero disables implicit pods/resources.
function fixture({ width = 4, height = 4, seed = 0, sea = 0, flat = 0 } = {}) {
  const count = width * height / 2;
  const abstractWidth = Math.floor((width + 4) / 5);
  const abstractHeight = Math.floor((height + 4) / 5);
  const abstractCount = Math.floor((abstractWidth + 1) / 2) * abstractHeight;
  const bytes = Buffer.alloc(tiles + count * tileSize + abstractCount);
  bytes.write('TERRANMAP\0\x1a', 0, 'binary');
  bytes.writeUInt32LE(5, 11);
  for (const [offset, value] of [
    [0, width], [4, height], [8, seed], [12, sea >>> 0], [20, count], [28, flat],
    [0xa24, abstractWidth], [0xa28, abstractHeight], [0xa2c, abstractCount],
  ]) bytes.writeUInt32LE(value, header + offset);
  for (let index = 0; index < count; ++index) setTile(bytes, index, {});
  return bytes;
}

function setTile(bytes, index, { altitude = 3, rain = 0, contour = 60, rock = 0, items = 0, landmarks = 0 } = {}) {
  const offset = tiles + index * tileSize;
  bytes[offset] = altitude * 32 + rain * 8;
  bytes[offset + 1] = contour;
  bytes[offset + 5] = rock * 64;
  bytes.writeUInt32LE(items >>> 0, offset + 8);
  bytes.writeUInt32LE(landmarks >>> 0, offset + 12);
}

function parse(bytes) {
  return module.ccall('ParseMap', 'number', ['array', 'number'], [bytes, bytes.length]);
}

function tile(index) {
  return Array.from({ length: 7 }, (_, field) => module._GetMapTileValue(index, field));
}

function assertValid(bytes) {
  assert.equal(parse(bytes), 1, module.UTF8ToString(module._GetMapError()));
}

test('SMAC map header, signed sea level, grid dimensions and packed tile order', () => {
  const bytes = fixture({ width: 8, height: 6, seed: 0xffffffff, sea: -2, flat: 1 });
  // Suppress procedural pods so this test isolates header and row order.
  for (let index = 0; index < 24; ++index) {
    setTile(bytes, index, { rain: index % 3, rock: (index + 1) % 3, items: 0x100000 });
  }
  assert.equal(module.ccall('HasMapSignature', 'number', ['array', 'number'], [bytes, bytes.length]), 1);
  assertValid(bytes);
  assert.deepEqual(Array.from({ length: 6 }, (_, field) => module._GetMapValue(field)),
    [8, 6, 0xffffffff, -2, 1, 24]);
  for (let index = 0; index < 24; ++index) {
    assert.deepEqual(tile(index).slice(1), [0, index % 3 + 1, (index + 1) % 3 + 1, 0, 0, 0]);
  }
  assert.equal(module._GetMapTileValue(24, 0), -1);
});

test('SMAC coast classification and contour heights survive contrary sea-level signs', () => {
  const bytes = fixture();
  setTile(bytes, 0, { altitude: 3, contour: 60 });
  setTile(bytes, 1, { altitude: 2, contour: 40 });
  setTile(bytes, 2, { altitude: 3, contour: 0 });
  setTile(bytes, 3, { altitude: 2, contour: 255 });
  setTile(bytes, 4, { altitude: 7, contour: 255 });
  setTile(bytes, 5, { altitude: 0, contour: 0 });
  setTile(bytes, 6, { altitude: 3, contour: 61 });
  assertValid(bytes);
  assert.deepEqual(Array.from({ length: 7 }, (_, index) => tile(index).slice(0, 2)),
    [[10, 0], [-990, 1], [1, 0], [-1, 1], [3500, 0], [-2990, 1], [64, 0]]);
});

test('SMAC features, landmarks and all thirteen terraforming flags map to game enums', () => {
  const bytes = fixture();
  const improvements = [0x4, 0x8, 0x200000, 0x8000, 0x80000, 0x40, 0x10,
    0x400000, 0x800000, 0x1000000, 0x80000000, 0x800, 0x40000];
  const allImprovements = improvements.reduce((bits, flag) => (bits | flag) >>> 0, 0);
  setTile(bytes, 0, { items: allImprovements | 0x80 | 0x2000 | 0x20,
    landmarks: 4 | 8 | 0x400 | 2 | 0x100 | 1 | 0x8000 | 0x40 });
  setTile(bytes, 1, { items: 0x10000000 });
  setTile(bytes, 2, { items: 0x10000000 | 0x100000 });
  setTile(bytes, 3, { items: 0x10000000 | 0x2000 });
  setTile(bytes, 4, { altitude: 1, items: 0x20, landmarks: 0x80000000 | 4 | 0x40 });
  setTile(bytes, 5, { landmarks: 0x800 });
  setTile(bytes, 6, { altitude: 2, items: 0x20 });
  assertValid(bytes);
  assert.equal(tile(0)[5], 1 | 2 | 4 | 8 | 16 | 32 | 128 | 256 | 512 | 1024 | 16384);
  assert.equal(tile(0)[6], 8191, 'Includes the unsigned sensor flag in the highest source bit');
  assert.equal(tile(1)[5], 64);
  assert.equal(tile(2)[5], 0, 'Removed pods do not return');
  assert.equal(tile(3)[5], 2, 'Monolith suppresses an overlapping pod');
  assert.equal(tile(4)[5], 0, 'Deep-ocean fungus and disabled landmarks are absent');
  assert.equal(tile(5)[5], 0, 'Pholus Ridge is not mislabeled as the Fossil Field landmark');
  assert.equal(tile(6)[5], 4, 'Shelf fungus is preserved');
});

test('SMAC resources preserve nutrient, mineral and energy enum meanings', () => {
  const bytes = fixture();
  setTile(bytes, 0, { items: 0x400 | 0x20000000 });
  setTile(bytes, 1, { items: 0x400 | 0x20000000 | 0x20000 });
  setTile(bytes, 2, { items: 0x400 | 0x20000000 | 0x10000 });
  setTile(bytes, 3, { altitude: 1, items: 0x400 | 0x20000000 });
  setTile(bytes, 4, { altitude: 2, items: 0x400 });
  assertValid(bytes);
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => tile(index)[4]), [1, 3, 2, 0, 3]);
});

test('SMAC seeded shelf resources and land pods retain original coordinate placement', () => {
  const bytes = fixture({ seed: 1 });
  // (1,1) has placement selector 1: resource on shelf, pod on land.
  setTile(bytes, 2, { altitude: 2 });
  setTile(bytes, 3, { altitude: 3 });
  assertValid(bytes);
  assert.equal(tile(2)[4], 3, 'Seeded shelf mineral at (1,1)');
  assert.equal(tile(2)[5], 0);
  assert.equal(tile(0)[5], 0);
  // Move the same selected coordinate to land, where it becomes a supply pod.
  setTile(bytes, 2, { altitude: 3 });
  assertValid(bytes);
  assert.equal(tile(2)[4], 0);
  assert.equal(tile(2)[5], 64);
});

test('SMAC malformed maps fail before exposing any partial grid and remain retryable', () => {
  const valid = fixture();
  const cases = [
    ['empty', Buffer.alloc(0)],
    ['short signature', valid.subarray(0, 10)],
    ['short version', valid.subarray(0, 13)],
    ['short header', valid.subarray(0, tiles - 1)],
    ['short tile data', valid.subarray(0, valid.length - 1)],
    ['trailing data', Buffer.concat([valid, Buffer.from([0])])],
  ];
  for (const [name, offset, value] of [
    ['signature', 0, 0], ['version', 11, 6], ['zero width', header, 0],
    ['odd height', header + 4, 3], ['huge width', header, 0xffffffff],
    ['tile count', header + 20, 7], ['flat flag', header + 28, 2],
    ['landmark count', header + 32, 65], ['abstract width', header + 0xa24, 2],
    ['abstract height', header + 0xa28, 2], ['abstract count', header + 0xa2c, 2],
  ]) {
    const bytes = Buffer.from(valid);
    bytes.writeUInt32LE(value, offset);
    cases.push([name, bytes]);
  }
  for (const [name, offset] of [['rainfall', tiles], ['rockiness', tiles + 5]]) {
    const bytes = Buffer.from(valid);
    bytes[offset] |= name === 'rainfall' ? 24 : 192;
    cases.push([name, bytes]);
  }
  for (const [name, bytes] of cases) {
    assert.equal(parse(bytes), 0, `${name} must fail`);
    assert.match(module.UTF8ToString(module._GetMapError()), /SMAC map/i, name);
    assert.equal(module._GetMapValue(5), 0, `${name} did not expose partial tiles`);
    assertValid(valid);
  }
});
