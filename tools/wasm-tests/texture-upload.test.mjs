import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

if (process.platform === 'linux') {
  process.env.EGL_PLATFORM = 'surfaceless';
  process.env.LIBGL_ALWAYS_SOFTWARE = '1';
  delete process.env.DISPLAY;
  delete process.env.WAYLAND_DISPLAY;
}
const { createWebGL2Context, WebGL2RenderingContext } = await import('webgl-node');
const createModule = createRequire(import.meta.url)('./build/texture-upload.cjs');

test('production WASM texture uploads preserve pixels within GPU size limits', async (t) => {
  const host = createWebGL2Context(32, 32, { antialias: false });
  globalThis.WebGLRenderingContext = class WebGLRenderingContext {};
  globalThis.WebGL2RenderingContext = WebGL2RenderingContext;
  globalThis.document = { querySelector: (selector) => selector === '#canvas' ? host.canvas : null };
  t.after(() => {
    delete globalThis.document;
    delete globalThis.WebGLRenderingContext;
    delete globalThis.WebGL2RenderingContext;
    host.destroy();
  });
  const module = await createModule({ canvas: host.canvas });
  const quadrants = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 255, 255]];
  const cases = [
    ['64x128 source fits a forced 32-pixel GPU limit and preserves quadrants', 0, 16, 32,
      (x, y) => quadrants[Number(y >= 16) * 2 + Number(x >= 8)]],
    ['odd dimensions include the trailing row and column in all RGBA channels', 1, 3, 4,
      (x, y) => [[20, 20, 110][x], [40, 40, 40, 100][y], 255, x === 2 && y === 3 ? 159 : 128]],
    ['dirty updates cross sample boundaries without changing neighboring pixels', 2, 16, 32,
      (x, y) => x > 1 || y > 1 ? [16, 32, 64, 255]
        : x === 1 && y === 1 ? [72, 56, 48, 223]
          : x === 0 && y === 0 ? [30, 38, 60, 247] : [44, 44, 56, 239]],
    ['unreduced uploads preserve every original byte', 3, 7, 5,
      (x, y) => [x * 17, y * 29, x + y, 80 + x * 3 + y * 5]],
    ['unreduced dirty rectangles preserve surrounding source pixels', 4, 7, 5,
      (x, y) => x >= 2 && x < 5 && y >= 1 && y < 4
        ? [201, 102, 53, 77] : [x * 17, y * 29, x + y, 80 + x * 3 + y * 5]],
    ['mipmaps remain valid after a reduced dirty update', 5, 8, 16,
      (x, y) => x < 4 && y < 8 ? [255, 255, 0, 255]
        : quadrants[Number(y >= 8) * 2 + Number(x >= 4)]],
    ['reduced images spanning multiple upload strips preserve the strip boundary', 6, 1024, 512,
      (_x, y) => y < 256 ? [255, 0, 0, 255] : [0, 0, 255, 255]],
    ['a one-pixel GPU limit averages the entire image without zero dimensions', 7, 1, 1,
      () => [127, 127, 127, 255]],
  ];
  for (const [name, mode, width, height, expectedPixel] of cases) {
    await t.test(name, () => {
      assert.equal(module._TextureUploadCase(mode), 0, 'Actual GL upload and readback complete without errors');
      assert.equal(module._GetUploadWidth(), width);
      assert.equal(module._GetUploadHeight(), height);
      const pointer = module._GetUploadPixels();
      const pixels = module.HEAPU8.subarray(pointer, pointer + width * height * 4);
      for (let y = 0; y < height; ++y) for (let x = 0; x < width; ++x) {
        const expected = expectedPixel(x, y);
        for (let channel = 0; channel < 4; ++channel) {
          const actual = pixels[(y * width + x) * 4 + channel];
          if (actual !== expected[channel]) assert.equal(actual, expected[channel], `Pixel (${x}, ${y}), channel ${channel}`);
        }
      }
    });
  }
});
