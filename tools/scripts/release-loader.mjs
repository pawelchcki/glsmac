import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  attachPackage,
  build,
  digest,
  packageSnapshot,
  root,
} from "./build.mjs";

const directory = join(root, "build/scripts/release-loader");
mkdirSync(directory, { recursive: true });
const source = join(directory, "probe.c");
const runtime = join(directory, "probe.cjs");
const wasm = join(directory, "probe.wasm");
writeFileSync(source, "int main(void) { return 0; }\n");
const result = spawnSync(
  "emcc",
  [
    "-O3",
    source,
    "-o",
    runtime,
    "--pre-js",
    join(root, "tools/scripts/wasm-loader.js"),
    "-sFORCE_FILESYSTEM=1",
    "-sMODULARIZE=1",
    "-sEXPORT_NAME=createPackageProbe",
    "-sEXPORTED_RUNTIME_METHODS=['FS']",
    "-sENVIRONMENT=node",
  ],
  { cwd: root, encoding: "utf8", timeout: 120000 },
);
if (result.error || result.status !== 0)
  throw new Error(
    result.stderr || result.error?.message || "Release link failed",
  );
assert.doesNotMatch(
  readFileSync(runtime, "utf8"),
  /Package bytes are generated/,
);
const before = digest(readFileSync(wasm));
await build({ runtimeFiles: [runtime] });
const snapshot = {
  ...packageSnapshot(),
  "GLSMAC_data/standard-js/unicode-probe.txt": "Zażółć 😀 \u2028",
};
attachPackage(runtime, snapshot);
const require = createRequire(import.meta.url);
const create = require(runtime);
const module = await create({ noInitialRun: true });
for (const [name, expected] of Object.entries(snapshot))
  assert.equal(module.FS.readFile(`/${name}`, { encoding: "utf8" }), expected);
const first = readFileSync(runtime, "utf8");
attachPackage(runtime, snapshot);
assert.equal(readFileSync(runtime, "utf8"), first);
assert.equal(digest(readFileSync(wasm)), before);
const report = {
  node: process.version,
  optimization: "-O3",
  wasm_sha256: before,
  runtime_sha256: digest(readFileSync(runtime)),
  package_root: JSON.parse(snapshot["GLSMAC_data/standard-js/manifest.json"])
    .root,
  mounted_files: Object.keys(snapshot).length,
};
writeFileSync(
  join(root, "build/scripts/release-loader.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log("SCRIPT_RELEASE_LOADER_PASS o3 unicode incremental wasm-stable");
