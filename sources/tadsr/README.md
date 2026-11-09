# TADS interpreter sources

The `tadsr` executable plays both TADS 2 (`.gam`) and TADS 3 (`.t3`) games,
using RemGlk for the plugin's JSON interface. The binaries in all four
`binaries/<arch>/` directories are static Linux executables built with Zig
0.14.1, CMake (Release), and the unmodified sources archived here:

- TADS Runner: https://github.com/tads-intfic/tads-runner at
  `b765c7d6016b2a0a2e72cf0d530439c06675e186` (`tads-runner.tar.gz`).
- RemGlk: https://github.com/erkyrath/remglk at
  `7d53a46a9d40d2e569b154e4740e8ac4eee67cb8` (`remglk.tar.gz`).

These archives contain the corresponding source and original notices. TADS
Runner is distributed under GPL version 2 (see `COPYING` and its README for
the Gargoyle licensing permission); RemGlk uses the MIT license (see
`REMGLK-LICENSE`). Static toolchain runtime notices (musl, libc++, libc++abi,
libunwind and Zig compiler runtime) are in `runtime-notices/`; their sources
are part of [Zig 0.14.1](https://ziglang.org/download/0.14.1/).
Archive checksums are recorded in `SHA256SUMS`.

To rebuild, install Zig 0.14.1, CMake, Make, tar and sha256sum. From the plugin
root, run:

```sh
tools/build-tads.sh x86_64
tools/build-tads.sh armel
tools/build-tads.sh armhf
tools/build-tads.sh aarch64
```

Builds use these bundled source archives and require no source downloads.
`ZIG`, `CMAKE`, `JOBS` and `TADS_BUILD_ROOT` may override the tool paths,
parallelism and intermediate build directory. Defaults are `zig`, `cmake`,
three jobs and `work/tads-build`. Each build replaces only its architecture's
`tadsr` binary. ARM soft-float and hard-float both target Cortex-A8 (ARMv7), matching the existing interpreter binaries;
64-bit ARM and x86-64 use their baseline CPU targets.

The test games and regression scripts in the TADS source archive are upstream
fixtures. Run `python3 tools/test-tads.py` for native protocol/input/save/restore
checks, or pass `--arch armel --emulator /path/to/qemu-arm-static` (likewise
`armhf`, or `aarch64` with `qemu-aarch64-static`) for cross-architecture checks.
Run `lua engines/test/tads.lua` from the plugin root to check discovery and
packaging. Emulation checks do not replace testing on physical e-readers.
