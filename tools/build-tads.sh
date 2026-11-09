#!/bin/sh
# Build the RemGlk TADS 2/3 interpreter for the plugin's four Linux ABIs.
# Requires make, cmake, tar, sha256sum and Zig 0.14.1. Everything builds as an ordinary user.
set -eu
arch=${1:-x86_64}
case "$arch" in
    x86_64) target=x86_64-linux-musl; cpu=baseline ;;
    armel) target=arm-linux-musleabi; cpu=cortex_a8 ;;
    armhf) target=arm-linux-musleabihf; cpu=cortex_a8 ;;
    aarch64) target=aarch64-linux-musl; cpu=baseline ;;
    *) echo "usage: $0 {x86_64|armel|armhf|aarch64}" >&2; exit 2 ;;
esac
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
build_root=${TADS_BUILD_ROOT:-"$root/work/tads-build"}
zig=${ZIG:-$(command -v zig)}
cmake=${CMAKE:-cmake}
jobs=${JOBS:-3}
mkdir -p "$build_root/$arch"
export ZIG_GLOBAL_CACHE_DIR=${ZIG_GLOBAL_CACHE_DIR:-"$build_root/zig-cache"}
# These are the corresponding, unmodified sources shipped with the binaries.
# Verify archives before using them; builds need no network connection.
sources="$root/sources/tadsr"
(cd "$sources" && sha256sum -c SHA256SUMS)
tar -xzf "$sources/tads-runner.tar.gz" -C "$build_root"
tar -xzf "$sources/remglk.tar.gz" -C "$build_root"
work="$build_root/$arch"
for lang in cc c++; do
    cat > "$work/$lang" <<WRAPPER
#!/bin/sh
exec "$zig" $lang -target "$target" -mcpu="$cpu" "\$@"
WRAPPER
    chmod +x "$work/$lang"
done
# Each ABI gets its own Glk archive and object directory.
mkdir -p "$work/remglk"
tar -xzf "$sources/remglk.tar.gz" --strip-components=1 -C "$work/remglk"
make -C "$work/remglk" -j"$jobs" CC="$work/cc" OPTIONS='-O2 -DNDEBUG'
"$cmake" -S "$build_root/tads-runner/glk" -B "$work/runner" \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
    -DCMAKE_SYSTEM_NAME=Linux -DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY \
    -DCMAKE_C_COMPILER="$work/cc" -DCMAKE_CXX_COMPILER="$work/c++" \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXE_LINKER_FLAGS=-static \
    -DGlkLibPath="$work/remglk"
"$cmake" --build "$work/runner" -j"$jobs"
mkdir -p "$root/binaries/$arch"
"$zig" objcopy --strip-all "$work/runner/tadsr" "$root/binaries/$arch/tadsr"
chmod 755 "$root/binaries/$arch/tadsr"
