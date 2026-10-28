{
  description = "GLSMAC C++23 development and analysis tools";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          llvm = pkgs.llvmPackages_23;
          expectedLLVM = (builtins.fromJSON (builtins.readFile ./tools/cpp-quality/toolchain.json)).llvm;
        in {
          default = assert llvm.clang.version == expectedLLVM; (pkgs.mkShell.override { stdenv = llvm.stdenv; }) {
            packages = with pkgs; [
              cmake ninja pkg-config git
              llvm.clang-tools llvm.lld llvm.llvm
              (python3.withPackages (ps: [ ps.pyyaml ]))
            ];
            # ASan intercepts dlopen; its caller's RUNPATH no longer finds SDL3
            # through sdl2-compat. Keep that required runtime library explicit.
            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
              (pkgs.sdl3.override { traySupport = false; })
            ];
            buildInputs = with pkgs; [
              freetype SDL2 SDL2_image libtiff libGLU glew libossp_uuid yaml-cpp
            ];
          };
        });
    };
}
