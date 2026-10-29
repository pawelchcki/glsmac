// Package bytes are generated from TS and patched into the JS glue after linking.
// The stable boundary lets script edits reuse the identical compiled WASM.
var glsmacStandardScripts = JSON.parse(
  atob("eyJHTFNNQUNfU1RBTkRBUkRfSlNfUEFDS0FHRV9WMSI6e319"),
)["GLSMAC_STANDARD_JS_PACKAGE_V1"];
Module["preRun"] = Module["preRun"] || [];
Module["preRun"].push(function () {
  if (glsmacStandardScripts.error) throw new Error(glsmacStandardScripts.error);
  if (!glsmacStandardScripts["GLSMAC_data/standard-js/manifest.json"])
    throw new Error(
      "Standard-JS package is missing; run npm run scripts:build",
    );
  for (var name of Object.keys(glsmacStandardScripts)) {
    var destination = "/" + name;
    FS.mkdirTree(destination.slice(0, destination.lastIndexOf("/")));
    FS.writeFile(destination, glsmacStandardScripts[name]);
  }
});
