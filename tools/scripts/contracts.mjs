import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function emit(filename, source) {
  if (existsSync(filename) && readFileSync(filename, "utf8") === source) return;
  mkdirSync(dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  writeFileSync(temporary, source);
  renameSync(temporary, filename);
}

export function contractSignature(inputs) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(inputs)
            .filter(([name]) =>
              /^scripts\/contracts\/[^/]+\.schema\.json$/.test(name),
            )
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        ),
      ),
    )
    .digest("hex");
}

export function generateContracts(
  sourceRoot = resolve(import.meta.dirname, "../.."),
  cppOutput,
) {
  const schemas = readdirSync(join(sourceRoot, "scripts/contracts"))
    .filter((name) => name.endsWith(".schema.json"))
    .sort()
    .map((name) => {
      if (!/^[a-z][a-z0-9-]*\.schema\.json$/.test(name))
        throw new Error(`Invalid contract filename: ${name}`);
      const path = `scripts/contracts/${name}`;
      const bytes = readFileSync(join(sourceRoot, path));
      return {
        path,
        schema: JSON.parse(bytes.toString("utf8")),
        hash: createHash("sha256").update(bytes).digest("hex"),
      };
    });
  if (schemas.length === 0) throw new Error("No script contracts");
  const signature = contractSignature(
    Object.fromEntries(schemas.map(({ path, hash }) => [path, hash])),
  );
  const types = new Set();
  const entries = new Set();
  let definitions = "";
  const validators = { input: "", output: "" };
  for (const { path, schema } of schemas) {
    if (
      !/^[1-9][0-9]*$/.test(schema.version) ||
      BigInt(schema.version) >= 1n << 63n
    )
      throw new Error("Invalid contract version");
    const versionError =
      path === "scripts/contracts/tile-yield.schema.json"
        ? "Unsupported tile yield snapshot schema"
        : "Unsupported script snapshot schema";
    const shapes = schema.types;
    for (const [name, fields] of Object.entries(shapes)) {
      if (types.has(name)) throw new Error(`Duplicate contract type: ${name}`);
      types.add(name);
      if (
        !/^[A-Za-z][A-Za-z0-9]*$/.test(name) ||
        !Object.keys(fields).every((field) =>
          /^[A-Za-z_][A-Za-z_0-9]*$/.test(field),
        )
      )
        throw new Error("Invalid contract identifier");
      for (const kind of Object.values(fields)) {
        const type = kind.replace(/^nullable:/, "");
        if (
          !["int64", "bool", "version", "string", "float32"].includes(type) &&
          !Object.hasOwn(shapes, type)
        )
          throw new Error(`Unknown contract type: ${kind}`);
      }
    }
    const tsType = (kind) =>
      kind.startsWith("nullable:")
        ? `${tsType(kind.slice(9))} | null`
        : kind === "int64"
          ? "bigint"
          : kind === "string"
            ? "string"
            : kind === "float32"
              ? "number"
              : kind === "bool"
                ? "boolean"
                : kind === "version"
                  ? `${schema.version}n`
                  : `Readonly<${kind}>`;
    let ts = `// Generated from ${path}. Do not edit.\n`;
    for (const [name, fields] of Object.entries(shapes)) {
      ts += `export interface ${name} {\n${Object.entries(fields)
        .map(
          ([field, kind]) =>
            `  ${schema.mutable.includes(name) ? "" : "readonly "}${field}: ${tsType(kind)};`,
        )
        .join("\n")}\n}\n`;
    }
    ts += `const shapes: Readonly<Record<string, Readonly<Record<string, string>>>> = ${JSON.stringify(shapes)};\n`;
    ts += `function validate(value: unknown, kind: string, path: string): void {
  if (kind.startsWith('nullable:')) { if (value === null) return; validate(value, kind.slice(9), path); return; }
  if (kind === 'string') { if (typeof value !== 'string') throw new Error(path + ' must be string'); return; }
  if (kind === 'float32') { if (typeof value !== 'number' || !Number.isFinite(value) || !Object.is(Math.fround(value), value)) throw new Error(path + ' must be finite float32'); return; }
  if (kind === 'bool') { if (typeof value !== 'boolean') throw new Error(path + ' must be boolean'); return; }
  if (kind === 'int64' || kind === 'version') {
    if (typeof value !== 'bigint' || value < -(1n << 63n) || value >= (1n << 63n)) throw new Error(path + ' must be signed int64 BigInt');
    if (kind === 'version' && value !== ${schema.version}n) throw new Error(${JSON.stringify(versionError)});
    return;
  }
  const fields = shapes[kind];
  if (fields === undefined || typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(path + ' must be a contract record');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== Object.keys(fields).sort().join(',')) throw new Error(path + ' has incorrect fields');
  for (const [field, type] of Object.entries(fields)) validate(record[field], type, path + '.' + field);
}
`;
    for (const name of Object.keys(shapes))
      ts += `export function assert${name}(value: unknown): asserts value is ${name} { validate(value, '${name}', '${name}'); }\n`;
    emit(
      join(
        sourceRoot,
        "scripts/generated",
        path.split("/").at(-1).replace(".schema.json", ".ts"),
      ),
      ts,
    );
    const cppType = (kind) =>
      kind.startsWith("nullable:")
        ? `std::optional<${cppType(kind.slice(9))}>`
        : kind === "string"
          ? "std::string"
          : kind === "float32"
            ? "float"
            : kind === "bool"
              ? "bool"
              : ["int64", "version"].includes(kind)
                ? "int64_t"
                : kind;
    const decode = (kind, value) =>
      kind.startsWith("nullable:")
        ? `(std::holds_alternative<std::nullptr_t>(${value}.data) ? std::optional<${cppType(kind.slice(9))}>{} : std::optional<${cppType(kind.slice(9))}>{${decode(kind.slice(9), value)}})`
        : kind === "string"
          ? `String(${value})`
          : kind === "float32"
            ? `Float(${value})`
            : kind === "bool"
              ? `Boolean(${value})`
              : kind === "int64"
                ? `Integer(${value})`
                : kind === "version"
                  ? `Version(${value}, ${schema.version}, ${JSON.stringify(versionError)})`
                  : `Read${kind}(${value})`;
    let cpp = "";
    for (const [name, fields] of Object.entries(shapes)) {
      cpp += `struct ${name} {\n${Object.entries(fields)
        .map(([field, kind]) => `  ${cppType(kind)} ${field} = {};`)
        .join("\n")}\n};\n`;
      cpp += `inline ${name} Read${name}(const Value& value) { const auto& object = Record(value, ${Object.keys(fields).length}); return {\n${Object.entries(
        fields,
      )
        .map(
          ([field, kind]) => `  ${decode(kind, `Field(object, "${field}")`)}`,
        )
        .join(",\n")}\n}; }\n`;
    }
    definitions += cpp;
    for (const [entry, entrySignature] of Object.entries(schema.entrypoints)) {
      if (
        entries.has(entry) ||
        !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*:[A-Za-z][A-Za-z0-9]*$/.test(
          entry,
        )
      )
        throw new Error(`Invalid or duplicate contract entrypoint: ${entry}`);
      entries.add(entry);
      const [module, name] = entry.split(":");
      for (const phase of ["input", "output"]) {
        if (!Object.hasOwn(shapes, entrySignature[phase]))
          throw new Error(`Unknown entrypoint contract: ${entry}`);
        validators[phase] +=
          `  if (module == ${JSON.stringify(module)} && function == ${JSON.stringify(name)}) { (void)Read${entrySignature[phase]}(value); return; }\n`;
      }
    }
  }
  const generated = join(sourceRoot, "scripts/generated");
  const outputs = new Set(
    schemas.map(({ path }) =>
      path.split("/").at(-1).replace(".schema.json", ".ts"),
    ),
  );
  for (const name of readdirSync(generated)) {
    if (name.endsWith(".ts") && !outputs.has(name))
      rmSync(join(generated, name));
  }
  if (!cppOutput) return;
  let cpp = `// Generated from scripts/contracts/*.schema.json. Do not edit.
#pragma once
#include <optional>
#include <cmath>
#include "script/Runtime.h"
namespace script::contract {
inline constexpr const char* Signature = "${signature}";
inline const Value::Object& Record(const Value& value, size_t fields) {
  const auto* object = std::get_if<Value::Object>(&value.data);
  if (!object || object->size() != fields) throw Error("Incorrect contract record");
  return *object;
}
inline const Value& Field(const Value::Object& object, const char* name) {
  const auto found = object.find(name);
  if (found == object.end()) throw Error(std::string("Missing contract field: ") + name);
  return found->second;
}
inline int64_t Integer(const Value& value) { const auto* n = std::get_if<int64_t>(&value.data); if (!n) throw Error("Contract requires signed int64"); return *n; }
inline int64_t Version(const Value& value, int64_t expected, const char* reason) { const auto n = Integer(value); if (n != expected) throw Error(reason); return n; }
inline const std::string& String(const Value& value) { const auto* s = std::get_if<std::string>(&value.data); if (!s) throw Error("Contract requires string"); return *s; }
inline float Float(const Value& value) { const auto* n = std::get_if<float>(&value.data); if (!n || !std::isfinite(*n)) throw Error("Contract requires finite float32"); return *n; }
inline bool Boolean(const Value& value) { const auto* b = std::get_if<bool>(&value.data); if (!b) throw Error("Contract requires boolean"); return *b; }
`;
  cpp += definitions;
  for (const phase of ["input", "output"]) {
    cpp += `inline void Validate${phase === "input" ? "Input" : "Output"}(const std::string& module, const std::string& function, const Value& value) {\n${validators[phase]}}\n`;
  }
  cpp += "}\n";
  emit(cppOutput, cpp);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const position = process.argv.indexOf("--cpp");
  generateContracts(
    undefined,
    position < 0 ? undefined : resolve(process.argv[position + 1]),
  );
}
