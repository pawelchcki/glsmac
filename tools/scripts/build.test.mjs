import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Script } from "node:vm";
import {
  build,
  root,
  digest,
  packageSnapshot,
  verifiedManifest,
  stagePackage,
} from "./build.mjs";
import { compiler } from "./compiler.mjs";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "glsmac-ts-gate-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const name of [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "scripts",
    "tools/scripts",
  ]) {
    mkdirSync(join(directory, name, ".."), { recursive: true });
    cpSync(join(root, name), join(directory, name), { recursive: true });
  }
  const output = join(directory, "generated");
  const runtime = join(directory, "GLSMAC.js");
  writeFileSync(
    runtime,
    "var scripts = /* GLSMAC_STANDARD_JS_BEGIN */{};/* GLSMAC_STANDARD_JS_END */ var ready = true;\n",
  );
  return { sourceRoot: directory, output, runtimeFiles: [runtime], runtime };
}

test("staging selects verified packages, retains concurrent-reader generations and rejects changed compiler workers", async (t) => {
  const f = fixture(t);
  const first = await build(f);
  assert.doesNotThrow(() => new Script(readFileSync(f.runtime, "utf8")));
  const destination = join(f.sourceRoot, "staged");
  stagePackage(destination, f.output, f.sourceRoot);
  const selected = JSON.parse(
    readFileSync(join(destination, "manifest.json"), "utf8"),
  );
  const selectedModule = readFileSync(
    join(destination, selected.root, "fixtures/ui.js"),
    "utf8",
  );
  assert.deepEqual(
    packageSnapshot(destination, f.sourceRoot),
    packageSnapshot(f.output, f.sourceRoot),
  );
  writeFileSync(
    join(f.sourceRoot, "scripts/fixtures/ui.ts"),
    "export const revised = 2n;\n",
  );
  await build(f);
  stagePackage(destination, f.output, f.sourceRoot);
  assert.notEqual(
    verifiedManifest(destination, f.sourceRoot).root,
    first.manifest.root,
  );
  assert.equal(
    readFileSync(join(destination, selected.root, "fixtures/ui.js"), "utf8"),
    selectedModule,
    "A reader that selected the previous manifest can still load its module after publication",
  );
  assert.equal(existsSync(join(destination, "cache")), false);
  const implementation = join(f.sourceRoot, "tools/scripts/compiler.mjs");
  writeFileSync(
    implementation,
    readFileSync(implementation, "utf8") + "\n// changed worker\n",
  );
  await assert.rejects(build(f), /restart the script worker/);
  assert.equal(existsSync(join(f.output, "manifest.json")), false);
});

test("changed modules reuse unchanged transforms, preserve deterministic output and update only JS assets", async (t) => {
  const f = fixture(t);
  const first = await build(f);
  const wasm = join(f.sourceRoot, "GLSMAC.wasm");
  writeFileSync(wasm, "immutable native code");
  const before = digest(readFileSync(wasm));
  assert.equal(first.transformed, Object.keys(first.manifest.modules).length);
  assert.ok(first.transformed > 0);
  assert.equal((await build(f)).transformed, 0);
  const module = join(f.sourceRoot, "scripts/fixtures/ui.ts");
  const original = readFileSync(module, "utf8");
  writeFileSync(
    module,
    original + '\nexport const marker = "/* GLSMAC_STANDARD_JS_BEGIN */";\n',
  );
  assert.throws(() => verifiedManifest(f.output, f.sourceRoot), /Stale/);
  const changed = await build(f);
  assert.equal(
    (await build(f)).transformed,
    0,
    "Marker-like source text must remain opaque on subsequent publications",
  );
  assert.equal(changed.transformed, 1);
  assert.notEqual(changed.manifest.root, first.manifest.root);
  assert.equal(digest(readFileSync(wasm)), before);
  writeFileSync(module, original);
  assert.equal((await build(f)).manifest.root, first.manifest.root);
  assert.ok(
    Object.keys(packageSnapshot(f.output, f.sourceRoot)).some((name) =>
      name.endsWith("game/land-resource-yields.js"),
    ),
  );
});

test("a failed transform invalidates both native selection and the browser package instead of using old output", async (t) => {
  const f = fixture(t);
  await build(f);
  writeFileSync(
    join(f.sourceRoot, "scripts/fixtures/ui.ts"),
    "export const broken: = ;",
  );
  await assert.rejects(build(f));
  assert.equal(existsSync(join(f.output, "manifest.json")), false);
  assert.match(
    readFileSync(f.runtime, "utf8"),
    /TypeScript transformation failed/,
  );
  assert.throws(() => packageSnapshot(f.output, f.sourceRoot));
});

test("path, configuration and emitted-byte changes cannot reuse stale output", async (t) => {
  const f = fixture(t);
  const first = await build(f);
  const filename = join(f.output, first.manifest.root, "fixtures/ui.js");
  writeFileSync(filename, "unverified output");
  assert.throws(
    () => packageSnapshot(f.output, f.sourceRoot),
    /Changed script artifact/,
  );
  await build(f);
  writeFileSync(
    join(f.sourceRoot, "tsconfig.json"),
    readFileSync(join(f.sourceRoot, "tsconfig.json"), "utf8") + "\n",
  );
  assert.throws(() => verifiedManifest(f.output, f.sourceRoot), /Stale/);
  assert.equal(
    (await build(f)).transformed,
    Object.keys(first.manifest.modules).length,
  );
  writeFileSync(
    join(f.sourceRoot, "scripts/fixtures/new.ts"),
    "export const added = 1n;",
  );
  assert.throws(() => verifiedManifest(f.output, f.sourceRoot), /Stale/);
  assert.equal((await build(f)).transformed, 1);
});

for (const name of ["oxc", "swc", "swc-wasm"])
  test(`${name} retains original TS exception locations and rejects malformed TS`, async () => {
    const transform = await compiler(name);
    const source =
      'interface Input { count: bigint }\n\nexport function fail(input: Input): never {\n  throw new Error("location witness");\n}\n';
    const result = transform("scripts/fixtures/location.ts", source);
    assert.deepEqual(result.map.sourcesContent, [source]);
    const lines = result.code.split("\n");
    const line = lines.findIndex((text) => text.includes("throw new Error"));
    const column = lines[line].indexOf("throw");
    const mapped = originalPositionFor(new TraceMap(result.map), {
      line: line + 1,
      column,
    });
    assert.deepEqual(
      { source: mapped.source, line: mapped.line },
      { source: "scripts/fixtures/location.ts", line: 4 },
    );
    assert.throws(() =>
      transform("scripts/broken.ts", "export const broken: = ;"),
    );
  });

test("every domain schema participates in native package identity and removed schemas retire their generated modules", async (t) => {
  const f = fixture(t);
  const first = await build(f);
  const filename = join(f.sourceRoot, "scripts/contracts/probe.schema.json");
  const schema = {
    version: "1",
    mutable: [],
    types: {
      ProbeInput: { schema: "version", text: "string", amount: "float32" },
    },
    entrypoints: {
      "fixtures/probe:check": { input: "ProbeInput", output: "ProbeInput" },
    },
  };
  writeFileSync(filename, JSON.stringify(schema));
  assert.throws(() => verifiedManifest(f.output, f.sourceRoot), /Stale/);
  const second = await build(f);
  assert.notEqual(
    second.manifest.contract_sha256,
    first.manifest.contract_sha256,
  );
  assert.ok(second.manifest.modules["generated/probe.js"]);
  schema.version = "2";
  writeFileSync(filename, JSON.stringify(schema));
  const third = await build(f);
  assert.notEqual(
    third.manifest.contract_sha256,
    second.manifest.contract_sha256,
  );
  rmSync(filename);
  const removed = await build(f);
  assert.equal(
    removed.manifest.contract_sha256,
    first.manifest.contract_sha256,
  );
  assert.equal(removed.manifest.root, first.manifest.root);
  assert.equal(
    existsSync(join(f.sourceRoot, "scripts/generated/probe.ts")),
    false,
  );
});

test("contract generation rejects ambiguous types and entrypoints across domains", async (t) => {
  const f = fixture(t);
  const schema = JSON.parse(
    readFileSync(
      join(f.sourceRoot, "scripts/contracts/unit-orders.schema.json"),
      "utf8",
    ),
  );
  const filename = join(
    f.sourceRoot,
    "scripts/contracts/duplicate.schema.json",
  );
  writeFileSync(filename, JSON.stringify(schema));
  await assert.rejects(build(f), /Duplicate contract type/);
  assert.equal(existsSync(join(f.output, "manifest.json")), false);
  schema.types = { DuplicateInput: { schema: "version" } };
  schema.entrypoints = {
    "game/unit-orders:validate": {
      input: "DuplicateInput",
      output: "DuplicateInput",
    },
  };
  writeFileSync(filename, JSON.stringify(schema));
  await assert.rejects(build(f), /duplicate contract entrypoint/);
});
