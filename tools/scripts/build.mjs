import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  watch,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compiler, options, versions } from "./compiler.mjs";
import { generateContracts } from "./contracts.mjs";

export const root = resolve(import.meta.dirname, "../..");
export const defaultOutput = join(root, "GLSMAC_data/standard-js");
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const implementation = Object.fromEntries(
  ["build.mjs", "compiler.mjs", "contracts.mjs"].map((name) => [
    name,
    digest(readFileSync(new URL(name, import.meta.url))),
  ]),
);
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const filesUnder = (directory) =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();

export function inputsAt(sourceRoot = root) {
  const names = [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    ...filesUnder(join(sourceRoot, "scripts"))
      .filter(
        (path) =>
          !relative(join(sourceRoot, "scripts"), path)
            .replaceAll("\\", "/")
            .startsWith("generated/"),
      )
      .map((path) => relative(sourceRoot, path)),
    ...filesUnder(join(sourceRoot, "tools/scripts"))
      .filter((path) => path.endsWith(".mjs"))
      .map((path) => relative(sourceRoot, path)),
  ];
  return Object.fromEntries(
    names
      .map((name) => name.replaceAll("\\", "/"))
      .sort(compare)
      .map((name) => [name, digest(readFileSync(join(sourceRoot, name)))]),
  );
}

function atomicFile(filename, bytes) {
  mkdirSync(dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, bytes);
    renameSync(temporary, filename);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function verifiedManifest(output = defaultOutput, sourceRoot = root) {
  const manifest = JSON.parse(
    readFileSync(join(output, "manifest.json"), "utf8"),
  );
  if (
    manifest.schema !== "glsmac.standard-js.v1" ||
    !/^packages\/[a-f0-9]{64}$/.test(manifest.root)
  )
    throw new Error("Invalid script package manifest");
  if (JSON.stringify(manifest.inputs) !== JSON.stringify(inputsAt(sourceRoot)))
    throw new Error("Stale script package; run npm run scripts:build");
  if (
    manifest.contract_sha256 !==
    manifest.inputs["scripts/contracts/tile-yield.schema.json"]
  )
    throw new Error("Invalid script contract signature");
  if (
    JSON.stringify(manifest.compiler) !==
    JSON.stringify({ name: "oxc-transform", version: versions.oxc, options })
  )
    throw new Error("Invalid compiler configuration");
  const identity = digest(
    JSON.stringify({
      inputs: manifest.inputs,
      artifacts: manifest.artifacts,
      compiler: versions.oxc,
      options,
    }),
  );
  if (manifest.root !== `packages/${identity}`)
    throw new Error("Invalid script package identity");
  const expectedArtifacts = [
    "package.json",
    ...Object.keys(manifest.modules).flatMap((name) => {
      if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.js$/.test(name))
        throw new Error("Invalid module path");
      return [name, `${name}.map`];
    }),
  ].sort(compare);
  if (
    JSON.stringify(Object.keys(manifest.artifacts).sort(compare)) !==
    JSON.stringify(expectedArtifacts)
  )
    throw new Error("Incomplete script artifact inventory");
  for (const [name, expected] of Object.entries(manifest.artifacts)) {
    if (
      name.includes("..") ||
      !/^[a-zA-Z0-9_./-]+$/.test(name) ||
      name.startsWith("/")
    )
      throw new Error("Invalid script artifact path");
    if (digest(readFileSync(join(output, manifest.root, name))) !== expected)
      throw new Error(`Changed script artifact: ${name}`);
  }
  return manifest;
}

export function packageSnapshot(output = defaultOutput, sourceRoot = root) {
  const manifest = verifiedManifest(output, sourceRoot);
  const prefix = "GLSMAC_data/standard-js/";
  return Object.fromEntries([
    [`${prefix}manifest.json`, JSON.stringify(manifest)],
    ...Object.keys(manifest.artifacts)
      .sort()
      .map((name) => [
        prefix + manifest.root + "/" + name,
        readFileSync(join(output, manifest.root, name), "utf8"),
      ]),
  ]);
}

export function currentPackage(sourceRoot = root) {
  if (!existsSync(join(sourceRoot, "scripts"))) return {};
  const local = join(sourceRoot, "GLSMAC_data/standard-js");
  return packageSnapshot(
    existsSync(local) ? local : join(sourceRoot, "build/wasm/bin/scripts"),
    sourceRoot,
  );
}

export function stagePackage(
  directory,
  output = defaultOutput,
  sourceRoot = root,
) {
  const manifest = verifiedManifest(output, sourceRoot);
  for (const name of Object.keys(manifest.artifacts))
    atomicFile(
      join(directory, manifest.root, name),
      readFileSync(join(output, manifest.root, name)),
    );
  atomicFile(join(directory, "manifest.json"), JSON.stringify(manifest) + "\n");
  for (const name of readdirSync(directory))
    if (name !== "manifest.json" && name !== "packages")
      rmSync(join(directory, name), { recursive: true, force: true });
  // A reader may already hold an older manifest while lazily loading imports.
  // Retire generations only by cleaning this directory with all readers stopped.
}

// The stable markers are part of the compiled loader, not transformed policy.
// Replacing this JSON updates JS assets without touching any native/WASM bytes.
export function attachPackage(filename, snapshot) {
  const start = "/* GLSMAC_STANDARD_JS_BEGIN */";
  const end = "/* GLSMAC_STANDARD_JS_END */";
  const source = readFileSync(filename, "utf8");
  const begin = source.indexOf(start),
    finish = source.indexOf(end);
  if (
    begin < 0 ||
    finish < begin ||
    source.indexOf(start, begin + start.length) >= 0
  )
    throw new Error(
      `Runtime lacks a unique standard-JS package boundary: ${filename}`,
    );
  const next =
    source.slice(0, begin + start.length) +
    JSON.stringify(snapshot).replaceAll(
      "/* GLSMAC_STANDARD_JS_",
      "\\u002f* GLSMAC_STANDARD_JS_",
    ) +
    ";" +
    source.slice(finish);
  if (next !== source) atomicFile(filename, next);
}

export async function build({
  sourceRoot = root,
  output = defaultOutput,
  runtimeFiles = [],
} = {}) {
  mkdirSync(output, { recursive: true });
  try {
    for (const [name, hash] of Object.entries(implementation))
      if (
        digest(readFileSync(join(sourceRoot, "tools/scripts", name))) !== hash
      )
        throw new Error(
          "Compiler implementation changed; restart the script worker",
        );
    generateContracts(sourceRoot);
    let manifest;
    try {
      manifest = verifiedManifest(output, sourceRoot);
    } catch {
      /* Rebuild and verify below. */
    }
    let transformed = 0;
    if (!manifest) {
      const inputs = inputsAt(sourceRoot);
      const transform = await compiler();
      const products = new Map([["package.json", '{"type":"module"}\n']]);
      const modules = {};
      const compilerInputs = Object.fromEntries(
        Object.entries(inputs).filter(([name]) => !name.startsWith("scripts/")),
      );
      for (const filename of filesUnder(join(sourceRoot, "scripts")).filter(
        (path) => path.endsWith(".ts"),
      )) {
        const logical = relative(
          join(sourceRoot, "scripts"),
          filename,
        ).replaceAll("\\", "/");
        const source = readFileSync(filename, "utf8");
        const key = digest(
          JSON.stringify({
            logical,
            source,
            compilerInputs,
            options,
            version: versions.oxc,
          }),
        );
        const cached = join(
          sourceRoot,
          "build/scripts/transform-cache",
          `${key}.json`,
        );
        let result;
        try {
          const candidate = JSON.parse(readFileSync(cached, "utf8"));
          if (
            candidate.key === key &&
            candidate.sha256 === digest(JSON.stringify(candidate.result))
          )
            result = candidate.result;
        } catch {
          /* A missing or damaged cache entry is rebuilt. */
        }
        if (!result) {
          result = transform(`scripts/${logical}`, source);
          atomicFile(
            cached,
            JSON.stringify({
              key,
              result,
              sha256: digest(JSON.stringify(result)),
            }),
          );
          ++transformed;
        }
        const name = logical.replace(/\.ts$/, ".js");
        if (!result.map) throw new Error(`Missing source map: ${logical}`);
        products.set(
          name,
          `${result.code}\n//# sourceMappingURL=${name.split("/").at(-1)}.map\n`,
        );
        products.set(`${name}.map`, JSON.stringify(result.map) + "\n");
        modules[name] = { source: `scripts/${logical}` };
      }
      if (!Object.keys(modules).length)
        throw new Error("No TypeScript source modules");
      const artifacts = Object.fromEntries(
        [...products]
          .map(([name, bytes]) => [name, digest(bytes)])
          .sort(([a], [b]) => compare(a, b)),
      );
      const identity = digest(
        JSON.stringify({ inputs, artifacts, compiler: versions.oxc, options }),
      );
      const directory = join(output, "packages", identity);
      mkdirSync(directory, { recursive: true });
      for (const [name, bytes] of products)
        atomicFile(join(directory, name), bytes);
      if (JSON.stringify(inputs) !== JSON.stringify(inputsAt(sourceRoot)))
        throw new Error("Sources changed during transformation");
      manifest = {
        schema: "glsmac.standard-js.v1",
        root: `packages/${identity}`,
        contract_sha256: inputs["scripts/contracts/tile-yield.schema.json"],
        compiler: { name: "oxc-transform", version: versions.oxc, options },
        inputs,
        modules,
        artifacts,
      };
      atomicFile(
        join(output, "manifest.json"),
        JSON.stringify(manifest) + "\n",
      );
    }
    const snapshot = packageSnapshot(output, sourceRoot);
    for (const filename of runtimeFiles) attachPackage(filename, snapshot);
    return { manifest, transformed };
  } catch (error) {
    // A previous package may remain cached, but cannot be selected after failure.
    rmSync(join(output, "manifest.json"), { force: true });
    for (const filename of runtimeFiles) {
      try {
        attachPackage(filename, {
          error: "TypeScript transformation failed; rebuild required",
        });
      } catch {}
    }
    throw error;
  }
}

function defaultRuntimes() {
  const directory = join(root, "build");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .map((name) => join(directory, name, "bin/GLSMAC.js"))
    .filter(existsSync)
    .filter((filename) =>
      readFileSync(filename, "utf8").includes("/* GLSMAC_STANDARD_JS_BEGIN */"),
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const runtimeFiles = defaultRuntimes();
  const stages = [];
  for (let i = 2; i < process.argv.length; ++i) {
    if (process.argv[i] === "--runtime-js")
      runtimeFiles.push(resolve(process.argv[++i]));
    else if (process.argv[i] === "--stage")
      stages.push(resolve(process.argv[++i]));
    else if (process.argv[i] !== "--watch")
      throw new Error(`Unknown argument: ${process.argv[i]}`);
  }
  const run = async () => {
    const started = performance.now();
    const result = await build({ runtimeFiles: [...new Set(runtimeFiles)] });
    for (const directory of stages) stagePackage(directory);
    console.log(
      `TypeScript: ${result.transformed} transformed, ${Object.keys(result.manifest.modules).length} modules; ${(performance.now() - started).toFixed(2)} ms`,
    );
  };
  await run();
  if (process.argv.includes("--watch")) {
    let timer;
    let pending = Promise.resolve();
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        pending = pending
          .then(run)
          .catch((error) => console.error(error.message));
      }, 20);
    };
    watch(join(root, "scripts"), { recursive: true }, changed);
    watch(join(root, "tools/scripts"), { recursive: true }, changed);
    for (const name of ["package.json", "package-lock.json", "tsconfig.json"])
      watch(join(root, name), changed);
  }
}
