import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { arch, cpus, platform, release, tmpdir, totalmem } from "node:os";
import { dirname, join, relative } from "node:path";
import { compiler, versions } from "./compiler.mjs";
import { digest, filesUnder, root } from "./build.mjs";

const inputs = filesUnder(join(root, "scripts"))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => [
    relative(root, name).replaceAll("\\", "/"),
    readFileSync(name, "utf8"),
  ]);
const summarize = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    min_ms: sorted[0],
    median_ms: sorted[Math.floor(sorted.length / 2)],
    p95_ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
};

if (process.argv[2] === "--sample") {
  const backend = process.argv[3];
  const started = performance.now();
  const transform = await compiler(backend);
  const imported = performance.now();
  const outputs = inputs.map(([name, source]) => transform(name, source));
  const first = performance.now();
  const edits = [],
    full = [];
  const [name, source] = inputs.find(([filename]) =>
    filename.endsWith("land-resource-yields.ts"),
  );
  for (let i = 0; i < 200; ++i) {
    const begin = performance.now();
    transform(name, `${source}\n// warm edit ${i}\n`);
    edits.push(performance.now() - begin);
  }
  for (let i = 0; i < 50; ++i) {
    const begin = performance.now();
    for (const [filename, text] of inputs) transform(filename, text);
    full.push(performance.now() - begin);
  }
  console.log(
    JSON.stringify({
      backend,
      version: versions[backend],
      import_ms: imported - started,
      first_full_transform_ms: first - imported,
      warm_changed_module: summarize(edits),
      warm_full_transform: summarize(full),
      process_peak_rss_kib: process.resourceUsage().maxRSS,
      code_bytes: outputs.reduce(
        (n, output) => n + Buffer.byteLength(output.code),
        0,
      ),
      source_map_bytes: outputs.reduce(
        (n, output) => n + Buffer.byteLength(JSON.stringify(output.map)),
        0,
      ),
    }),
  );
} else {
  const results = [];
  for (const backend of ["oxc", "swc", "swc-wasm"]) {
    const cold = [],
      runs = [];
    for (let i = 0; i < 5; ++i) {
      const begin = performance.now();
      const result = spawnSync(
        process.execPath,
        [import.meta.filename, "--sample", backend],
        { cwd: root, encoding: "utf8", timeout: 60000 },
      );
      if (result.error || result.status !== 0)
        throw new Error(
          result.stderr || result.error?.message || "Benchmark worker failed",
        );
      cold.push(performance.now() - begin);
      runs.push(JSON.parse(result.stdout));
    }
    results.push({
      backend,
      cold_process_and_transform: summarize(cold),
      runs,
    });
  }
  const checking = [];
  const cache = mkdtempSync(join(tmpdir(), "glsmac-typecheck-benchmark-"));
  try {
    for (let i = 0; i < 2; ++i) {
      const begin = performance.now();
      const result = spawnSync(
        process.execPath,
        [
          join(root, "node_modules/typescript/bin/tsc"),
          "--noEmit",
          "--tsBuildInfoFile",
          join(cache, "types.tsbuildinfo"),
        ],
        { cwd: root, encoding: "utf8", timeout: 60000 },
      );
      if (result.error || result.status !== 0)
        throw new Error(
          result.stdout + result.stderr ||
            result.error?.message ||
            "Type check failed",
        );
      checking.push(performance.now() - begin);
    }
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
  const report = {
    schema: "glsmac.ts-transform-benchmark.v1",
    machine: {
      os: platform(),
      kernel: release(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      logical_cpus: cpus().length,
      memory_bytes: totalmem(),
      node: process.version,
    },
    sources_sha256: digest(JSON.stringify(inputs)),
    modules: inputs.map(([name, source]) => ({
      name,
      bytes: Buffer.byteLength(source),
      sha256: digest(source),
    })),
    results,
    type_check: {
      version: JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
        .devDependencies.typescript,
      cold_process_ms: checking[0],
      warm_incremental_process_ms: checking[1],
    },
  };
  const filename = join(root, "build/scripts/transform-benchmark.json");
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, JSON.stringify(report, null, 2) + "\n");
  for (const result of results) {
    console.log(
      `${result.backend}: cold p95 ${result.cold_process_and_transform.p95_ms.toFixed(2)} ms; warm edit p95 ${Math.max(...result.runs.map((run) => run.warm_changed_module.p95_ms)).toFixed(3)} ms; peak RSS ${Math.max(...result.runs.map((run) => run.process_peak_rss_kib))} KiB`,
    );
  }
  console.log(`Complete isolated-worker evidence: ${filename}`);
}
