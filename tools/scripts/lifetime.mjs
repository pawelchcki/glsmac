// Exercise real engine bytes with fresh script packages in an isolated tree.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
import { dirname, join, resolve } from "node:path";
import { build, digest, packageSnapshot, root } from "./build.mjs";

const argument = (name) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : resolve(process.argv[at + 1]);
};
const native = argument("--native");
const wasm = argument("--wasm");
assert.ok(native || wasm, "Supply --native PATH and/or --wasm PATH");
const identities = Object.fromEntries(
  [native, wasm && join(dirname(wasm), "GLSMAC.wasm")]
    .filter(Boolean)
    .map((path) => [path, digest(readFileSync(path))]),
);
const directory = mkdtempSync(join(tmpdir(), "glsmac-ts-lifetime-"));
const report = { version: 1, native_code_sha256: identities, phases: [] };
try {
  for (const name of [
    "scripts",
    "tools/scripts",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
  ]) {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    cpSync(join(root, name), join(directory, name), { recursive: true });
  }
  const output = join(directory, "GLSMAC_data/standard-js");
  const runtimeFiles = [];
  if (wasm) {
    const destination = join(directory, "engine/GLSMAC.js");
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(wasm, destination);
    cpSync(
      join(dirname(wasm), "GLSMAC.wasm"),
      join(dirname(destination), "GLSMAC.wasm"),
    );
    runtimeFiles.push(destination);
  }
  const run = (executable, args, options) => {
    const result = spawnSync(executable, args, {
      encoding: "utf8",
      timeout: 30000,
      ...options,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(
      result.stdout,
      /^All tests passed\.$/m,
      result.stdout + result.stderr,
    );
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /TEST FAILED|Testing complete, passed:/,
    );
    return result.stdout;
  };
  const execute = (expected) => {
    const script = `test.assert(#js_call('tests/runtime','identity',7) == ${expected});`;
    const filename = "GLSMAC_data/tests/lifetime.gls.js";
    mkdirSync(dirname(join(directory, filename)), { recursive: true });
    writeFileSync(join(directory, filename), script);
    if (native)
      run(
        native,
        [
          "--gse-tests",
          "--gse-tests-script",
          filename,
          "--quiet",
          "--prefix",
          join(directory, "prefix"),
        ],
        { cwd: directory },
      );
    if (wasm) {
      const snapshot = {
        ...packageSnapshot(output, directory),
        [filename]: `const behavior = #include('./_behavior'); behavior.scenario('script edit', () => { ${script} });`,
        "GLSMAC_data/tests/_behavior.gls.js": readFileSync(
          join(root, "GLSMAC_data/tests/_behavior.gls.js"),
          "utf8",
        ),
      };
      const frozen = join(directory, "snapshot.json");
      writeFileSync(frozen, JSON.stringify(snapshot));
      run(
        process.execPath,
        [join(root, "tools/behavior-tests/gse-worker.cjs")],
        {
          cwd: directory,
          input: JSON.stringify({
            runtime: runtimeFiles[0],
            snapshot: frozen,
            script: filename,
            prefix: join(directory, "wasm-prefix"),
          }),
        },
      );
    }
  };
  let started = performance.now();
  const initial = await build({ sourceRoot: directory, output, runtimeFiles });
  const initialSnapshot = packageSnapshot(output, directory);
  const initialBuild = performance.now() - started;
  started = performance.now();
  execute(7);
  report.phases.push({
    name: "initial",
    package: initial.manifest.root,
    build_ms: initialBuild,
    execute_ms: performance.now() - started,
  });
  const source = join(directory, "scripts/tests/runtime.ts");
  const original = readFileSync(source, "utf8");
  assert.ok(original.includes("return value;"));
  writeFileSync(
    source,
    original.replace(
      "return value;",
      'return typeof value === "bigint" ? value + 1n : value;',
    ),
  );
  started = performance.now();
  const changed = await build({ sourceRoot: directory, output, runtimeFiles });
  const changedBuild = performance.now() - started;
  assert.equal(changed.transformed, 1);
  started = performance.now();
  execute(8);
  report.phases.push({
    name: "script-only edit",
    package: changed.manifest.root,
    transformed: changed.transformed,
    build_ms: changedBuild,
    execute_ms: performance.now() - started,
  });
  if (wasm) {
    const filename = "GLSMAC_data/tests/package_switch.gls.js";
    const script = `const behavior = #include('./_behavior');
behavior.scenario('one package per yield operation', () => {
  const input = #js_call('tests/tile-yield','snapshot',null);
  const plan = #js_call('game/land-resource-yields','plan',input);
  const package_id = #js_package();
  #print('SCRIPT_PACKAGE_SWAP_NOW');
  let rejected = false;
  try { #js_call('game/land-resource-yields','resolve',{schema:1,plan:plan,caps:input.caps},package_id); }
  catch { GSEOperationFailed: (error) => {
    test.assert(error.reason == 'TypeScript policy failed: Script package changed during operation');
    rejected = true;
  } }
  test.assert(rejected);
  test.assert(#js_call('tests/runtime','identity',7) == 8);
});`;
    const frozen = join(directory, "switch.json");
    writeFileSync(
      frozen,
      JSON.stringify({
        ...initialSnapshot,
        [filename]: script,
        "GLSMAC_data/tests/_behavior.gls.js": readFileSync(
          join(root, "GLSMAC_data/tests/_behavior.gls.js"),
          "utf8",
        ),
      }),
    );
    const worker = join(root, "tools/scripts/package-switch-worker.cjs");
    run(process.execPath, [worker], {
      cwd: directory,
      input: JSON.stringify({
        run: {
          runtime: runtimeFiles[0],
          snapshot: frozen,
          script: filename,
          prefix: join(directory, "switch-prefix"),
        },
        package: packageSnapshot(output, directory),
      }),
    });
    report.phases.push({
      name: "publication between plan and resolve is rejected",
      fixture_worker_sha256: digest(readFileSync(worker)),
    });
  }
  writeFileSync(source, "export const invalid: = ;");
  await assert.rejects(build({ sourceRoot: directory, output, runtimeFiles }));
  assert.equal(existsSync(join(output, "manifest.json")), false);
  if (native) {
    // A valid sidecar exists beside the executable, but the failed local package
    // takes precedence. It must never fall back to that older native package.
    assert.ok(existsSync(join(dirname(native), "scripts/manifest.json")));
    const filename = "GLSMAC_data/tests/failed_package.gls.js";
    writeFileSync(
      join(directory, filename),
      "let rejected = false; try { #js_call('tests/runtime','identity',7); } catch { : (error) => { rejected = true; } } test.assert(rejected);",
    );
    run(
      native,
      [
        "--gse-tests",
        "--gse-tests-script",
        filename,
        "--quiet",
        "--prefix",
        join(directory, "failed-prefix"),
      ],
      { cwd: directory },
    );
  }
  if (wasm) {
    // The failure payload may be encoded by the release loader. Check its
    // observable startup behavior instead of searching its serialized bytes.
    const failed = spawnSync(
      process.execPath,
      [
        runtimeFiles[0],
        "--gse-tests",
        "--quiet",
        "--prefix",
        join(directory, "failed-wasm-prefix"),
      ],
      {
        cwd: directory,
        encoding: "utf8",
        timeout: 30000,
      },
    );
    assert.ifError(failed.error);
    assert.notEqual(failed.status, 0, failed.stdout + failed.stderr);
    assert.match(
      failed.stdout + failed.stderr,
      /TypeScript transformation failed; rebuild required/,
    );
    assert.doesNotMatch(failed.stdout + failed.stderr, /^All tests passed\.$/m);
  }
  report.phases.push({ name: "failed transform invalidates selection" });
  for (const [path, hash] of Object.entries(identities))
    assert.equal(
      digest(readFileSync(path)),
      hash,
      "Native code changed during a TypeScript-only edit",
    );
  mkdirSync(join(root, "build/scripts"), { recursive: true });
  writeFileSync(
    join(root, `build/scripts/lifetime-${native ? "native" : "wasm"}.json`),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    "SCRIPT_LIFETIME_PASS real script-only edit, unchanged native code, failed-package rejection",
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
