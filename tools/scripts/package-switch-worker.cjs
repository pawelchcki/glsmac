// Deterministically publish another verified package while the real WASM
// engine is between its plan and resolve calls. All writes stay in its MEMFS.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const request = JSON.parse(fs.readFileSync(0, "utf8"));
const read = fs.readFileSync.bind(fs);
fs.readFileSync = (name, ...args) =>
  name === 0 ? JSON.stringify(request.run) : read(name, ...args);
const write = fs.writeSync.bind(fs);
let pending = "",
  switched = false;
fs.writeSync = (fd, data, offset, length, position) => {
  const count = write(fd, data, offset, length, position);
  if (fd === 1 && !switched) {
    const bytes =
      typeof data === "string"
        ? Buffer.from(data)
        : Buffer.from(data.buffer, data.byteOffset + (offset || 0), count);
    pending = (pending + bytes.toString("utf8")).slice(-256);
    if (pending.includes("SCRIPT_PACKAGE_SWAP_NOW")) {
      switched = true;
      const Module = require(request.run.runtime);
      for (const [name, source] of Object.entries(request.package)) {
        assert.ok(
          name.startsWith("GLSMAC_data/standard-js/") && !name.includes(".."),
        );
        const path = "/behavior-snapshot/" + name;
        Module.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));
        Module.FS.writeFile(path, source);
      }
    }
  }
  return count;
};
process.on("exit", () =>
  assert.ok(
    switched,
    "The actual engine must reach the package publication barrier",
  ),
);
require("../behavior-tests/gse-worker.cjs");
