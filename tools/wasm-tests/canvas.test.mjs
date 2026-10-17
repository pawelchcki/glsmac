import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { PNG } from 'pngjs';

// Set these before loading the native EGL addon. No DISPLAY or GPU is needed.
if (process.platform === 'linux') {
  process.env.EGL_PLATFORM = 'surfaceless';
  process.env.LIBGL_ALWAYS_SOFTWARE = '1';
  delete process.env.DISPLAY;
  delete process.env.WAYLAND_DISPLAY;
}
const { createWebGL2Context, WebGL2RenderingContext } = await import('webgl-node');
const create_module = createRequire(import.meta.url)('./build/canvas.cjs');

function check_pixels(pixels, width, height) {
  const colors = [
    [255, 0, 0, 255], [0, 255, 0, 255],
    [0, 0, 255, 255], [255, 255, 255, 255],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const expected = colors[Number(y >= height / 2) * 2 + Number(x >= width / 2)];
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel++) {
        assert.equal(pixels[offset + channel], expected[channel],
          `Pixel (${x}, ${y}), channel ${channel}`);
      }
    }
  }
}

function save_frame(pixels, width, height, name) {
  const png = new PNG({ width, height });
  // GL readback starts at the bottom; PNG starts at the top.
  for (let y = 0; y < height; y++) {
    png.data.set(pixels.subarray(y * width * 4, (y + 1) * width * 4),
      (height - y - 1) * width * 4);
  }
  const directory = new URL('build/artifacts/', import.meta.url);
  mkdirSync(directory, { recursive: true });
  writeFileSync(new URL(`${name}.png`, directory), PNG.sync.write(png));
}

test('WASM renders to a WebGL2 canvas without a browser', async (t) => {
  const host = createWebGL2Context(64, 48, { antialias: false });
  t.after(() => {
    delete globalThis.document;
    delete globalThis.WebGLRenderingContext;
    delete globalThis.WebGL2RenderingContext;
    host.destroy();
  });
  globalThis.WebGLRenderingContext = class WebGLRenderingContext {};
  globalThis.WebGL2RenderingContext = WebGL2RenderingContext;
  // Emscripten resolves the same #canvas selector used by a browser build.
  globalThis.document = {
    querySelector: (selector) => selector === '#canvas' ? host.canvas : null,
  };
  t.diagnostic(`Renderer: ${host.gl.getParameter(host.gl.RENDERER)}`);
  const module = await create_module({ canvas: host.canvas });

  for (const [name, width, height, offscreen] of [
    ['canvas', 64, 48, 0],
    ['resized-canvas', 96, 64, 0],
    ['framebuffer', 96, 64, 1],
  ]) {
    await t.test(name, () => {
      host.resize(width, height);
      assert.equal(module._RenderFrame(offscreen), 0, 'C++ rendering succeeded');
      const pixels = module.HEAPU8.slice(module._GetPixels(),
        module._GetPixels() + width * height * 4);
      save_frame(pixels, width, height, name);
      check_pixels(pixels, width, height);
    });
  }
});
