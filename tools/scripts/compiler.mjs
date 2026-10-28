import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const versions = {
  oxc: "0.156.0",
  swc: "1.16.20",
  "swc-wasm": "1.16.20",
};
export const options = {
  lang: "ts",
  sourceType: "module",
  target: "es2022",
  sourcemap: true,
  typescript: { onlyRemoveTypeImports: true, allowNamespaces: false },
};

export async function compiler(name = "oxc") {
  if (name === "oxc") {
    const api = await import("oxc-transform");
    if (require("oxc-transform/package.json").version !== versions.oxc)
      throw new Error("Unpinned Oxc installation");
    return (filename, source) => {
      const result = api.transformSync(filename, source, options);
      if (result.errors.length)
        throw new Error(
          result.errors
            .map((error) => {
              const prefix = Buffer.from(source)
                .subarray(0, error.labels[0]?.start ?? 0)
                .toString("utf8")
                .split("\n");
              return `${filename}:${prefix.length}:${prefix.at(-1).length + 1}: ${error.message}`;
            })
            .join("\n"),
        );
      return { code: result.code, map: result.map };
    };
  }
  if (name === "swc") {
    const api = await import("@swc/core");
    if (api.version !== versions.swc)
      throw new Error("Unpinned SWC installation");
    return (filename, source) => {
      const result = api.transformSync(source, {
        filename,
        configFile: false,
        swcrc: false,
        sourceMaps: true,
        inlineSourcesContent: true,
        jsc: {
          parser: { syntax: "typescript" },
          target: "es2022",
          transform: { verbatimModuleSyntax: true },
        },
        module: { type: "es6" },
      });
      return { code: result.code, map: JSON.parse(result.map) };
    };
  }
  if (name === "swc-wasm") {
    const api = await import("@swc/wasm-typescript");
    if (
      require("@swc/wasm-typescript/package.json").version !==
      versions["swc-wasm"]
    )
      throw new Error("Unpinned SWC WASM installation");
    return (filename, source) => {
      const result = api.transformSync(source, {
        filename,
        module: true,
        mode: "transform",
        sourceMap: true,
        transform: { verbatimModuleSyntax: true, nativeClassProperties: true },
      });
      const map = JSON.parse(result.map);
      // This API omits inline source text. Normalize it to the other backends
      // so source-map usability and benchmark sizes use identical inputs.
      map.sourcesContent = [source];
      return { code: result.code, map };
    };
  }
  throw new Error(`Unknown transformer: ${name}`);
}
