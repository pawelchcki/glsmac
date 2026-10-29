import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { packageSnapshot, root } from "../scripts/build.mjs";

const binary = resolve(
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
    "build/script-wasm/bin/script-runtime-probe.cjs",
);
const snapshot = packageSnapshot();
const lines = [];
const errors = [];
let browserVersion;
const hashes = Object.fromEntries(
  [binary, binary.replace(/\.cjs$/, ".wasm")].map((path) => [
    path,
    createHash("sha256").update(readFileSync(path)).digest("hex"),
  ]),
);
if (process.argv.includes("--browser")) {
  const require = createRequire(
    new URL("../wasm-tests/package.json", import.meta.url),
  );
  const { chromium } = require("playwright");
  const server = createServer((request, response) => {
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    if (request.url === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end(
        '<!doctype html><script src="/script-runtime-probe.cjs"></script>',
      );
    } else if (
      ["/script-runtime-probe.cjs", "/script-runtime-probe.wasm"].includes(
        request.url,
      )
    ) {
      response.setHeader(
        "Content-Type",
        request.url.endsWith(".wasm") ? "application/wasm" : "text/javascript",
      );
      response.end(
        readFileSync(resolve(dirname(binary), request.url.slice(1))),
      );
    } else {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
      headless: true,
    });
    browserVersion = browser.version();
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    lines.push(
      ...(await page.evaluate(async (snapshot) => {
        const output = [];
        const module = await createScriptProbe({
          noInitialRun: true,
          print: (text) => output.push(text),
          printErr: (text) => output.push(text),
        });
        for (const [name, source] of Object.entries(snapshot)) {
          const path = "/" + name;
          module.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));
          module.FS.writeFile(path, source);
        }
        module.callMain(["/GLSMAC_data/standard-js"]);
        return output;
      }, snapshot)),
    );
  } finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
  }
} else {
  const create = createRequire(import.meta.url)(binary);
  const module = await create({
    noInitialRun: true,
    print: (text) => lines.push(text),
    printErr: (text) => errors.push(text),
  });
  for (const [name, source] of Object.entries(snapshot)) {
    const path = "/" + name;
    module.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));
    module.FS.writeFile(path, source);
  }
  module.callMain(["/GLSMAC_data/standard-js"]);
}
assert.deepEqual(errors, []);
assert.equal(
  lines.filter((line) => line.startsWith("SCRIPT_RUNTIME_PASS ")).length,
  1,
  lines.join("\n"),
);
const source = readFileSync(
  resolve(root, "scripts/tests/runtime.ts"),
  "utf8",
).split("\n");
const line = source.findIndex(
  (text) =>
    text.includes("new Error('original TypeScript location witness')") ||
    text.includes('new Error("original TypeScript location witness")'),
);
assert.ok(line >= 0);
const location = `scripts/tests/runtime.ts:${line + 1}:${source[line].indexOf("Error") + 1}`;
assert.ok(
  lines.join("\n").includes(location),
  `Missing exact original TypeScript location ${location}: ${lines.join("\n")}`,
);
const report = {
  version: 1,
  target: process.argv.includes("--browser") ? "browser" : "node-wasm",
  node: process.version,
  chromium: browserVersion,
  runtime_sha256: hashes,
  package: JSON.parse(snapshot["GLSMAC_data/standard-js/manifest.json"]).root,
  mapped_error: location,
  output: lines,
};
mkdirSync(resolve(root, "build/scripts"), { recursive: true });
writeFileSync(
  resolve(root, `build/scripts/runtime-${report.target}.json`),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(lines.join("\n"));
