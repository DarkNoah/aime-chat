#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DOCKERFILE="${PROJECT_ROOT}/.erb/docker/linux-arm64-glibc228.Dockerfile"
OUTPUT_DIR="${PROJECT_ROOT}/release/build"
TEMP_OUTPUT="$(mktemp -d "${TMPDIR:-/tmp}/aime-chat-linux-arm64.XXXXXX")"

cleanup() {
  rm -rf "${TEMP_OUTPUT}"
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
Build the Linux ARM64 Debian package on macOS/ARM64 with a GLIBC 2.28
compatibility baseline.

Usage:
  npm run package:linux-arm64
  npm run package:linux-arm64 -- --no-cache

Environment overrides:
  NODE_BUILD_VERSION       Node used by the build containers (default: 22.16.0)
  PNPM_VERSION             pnpm used in the packaging container (default: 10.12.1)
  FPM_VERSION              fpm used by electron-builder (default: 1.16.0)
  MAX_GLIBC_VERSION        Maximum accepted GLIBC version (default: 2.28)
  MAX_GLIBCXX_VERSION      Maximum accepted GLIBCXX version (default: 3.4.25)
  DOCKER_PROGRESS          buildx progress mode (default: plain)
EOF
}

NO_CACHE=false
case "${1:-}" in
  "")
    ;;
  --no-cache)
    NO_CACHE=true
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    echo "Unknown option: $1" >&2
    usage >&2
    exit 2
    ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or is not available on PATH." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker Desktop is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

if ! docker buildx version >/dev/null 2>&1; then
  echo "Docker Buildx is required but is not available." >&2
  exit 1
fi

if [[ ! -f "${DOCKERFILE}" ]]; then
  echo "Dockerfile not found: ${DOCKERFILE}" >&2
  exit 1
fi

if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" != "arm64" ]]; then
  echo "Warning: this Mac is not ARM64; the Linux ARM64 build will use emulation." >&2
fi

read_locked_version() {
  local package_pattern="$1"
  sed -nE "s|^  '?${package_pattern}@([0-9]+\\.[0-9]+\\.[0-9]+)'?:$|\\1|p" \
    "${PROJECT_ROOT}/pnpm-lock.yaml" \
    | sort -V \
    | tail -1
}

ELECTRON_VERSION="$(read_locked_version 'electron')"
ELECTRON_REBUILD_VERSION="$(read_locked_version '@electron/rebuild')"

if [[ -z "${ELECTRON_VERSION}" ]]; then
  echo "Unable to determine the locked Electron version from pnpm-lock.yaml." >&2
  exit 1
fi

if [[ -z "${ELECTRON_REBUILD_VERSION}" ]]; then
  echo "Unable to determine the locked @electron/rebuild version from pnpm-lock.yaml." >&2
  exit 1
fi

NODE_BUILD_VERSION="${NODE_BUILD_VERSION:-22.16.0}"
PNPM_VERSION="${PNPM_VERSION:-10.12.1}"
FPM_VERSION="${FPM_VERSION:-1.16.0}"
MAX_GLIBC_VERSION="${MAX_GLIBC_VERSION:-2.28}"
MAX_GLIBCXX_VERSION="${MAX_GLIBCXX_VERSION:-3.4.25}"
DOCKER_PROGRESS="${DOCKER_PROGRESS:-plain}"

echo "Building aime-chat Linux ARM64 package"
echo "  Electron:  ${ELECTRON_VERSION}"
echo "  Node:      ${NODE_BUILD_VERSION}"
echo "  GLIBC:     <= ${MAX_GLIBC_VERSION}"
echo "  GLIBCXX:   <= ${MAX_GLIBCXX_VERSION}"
echo "  Dockerfile: ${DOCKERFILE}"

DOCKER_BUILD_ARGS=(
  buildx build
  --platform linux/arm64
  --file "${DOCKERFILE}"
  --target artifact
  --progress "${DOCKER_PROGRESS}"
  --build-arg "NODE_BUILD_VERSION=${NODE_BUILD_VERSION}"
  --build-arg "ELECTRON_VERSION=${ELECTRON_VERSION}"
  --build-arg "ELECTRON_REBUILD_VERSION=${ELECTRON_REBUILD_VERSION}"
  --build-arg "PNPM_VERSION=${PNPM_VERSION}"
  --build-arg "FPM_VERSION=${FPM_VERSION}"
  --build-arg "MAX_GLIBC_VERSION=${MAX_GLIBC_VERSION}"
  --build-arg "MAX_GLIBCXX_VERSION=${MAX_GLIBCXX_VERSION}"
  --output "type=local,dest=${TEMP_OUTPUT}"
)

if [[ "${NO_CACHE}" == "true" ]]; then
  DOCKER_BUILD_ARGS+=(--no-cache)
fi

DOCKER_BUILD_ARGS+=("${PROJECT_ROOT}")
docker "${DOCKER_BUILD_ARGS[@]}"

artifact="$(find "${TEMP_OUTPUT}" -maxdepth 1 -type f -name '*-arm64-linux.deb' -print -quit)"
if [[ -z "${artifact}" ]]; then
  echo "Build completed without producing a Linux ARM64 .deb artifact." >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"

for output_file in \
  "${artifact}" \
  "${TEMP_OUTPUT}/$(basename "${artifact}").sha256" \
  "${TEMP_OUTPUT}/package-info.txt" \
  "${TEMP_OUTPUT}/artifact-file.txt" \
  "${TEMP_OUTPUT}/elf-compatibility.txt"; do
  if [[ -f "${output_file}" ]]; then
    cp -f "${output_file}" "${OUTPUT_DIR}/"
  fi
done

final_artifact="${OUTPUT_DIR}/$(basename "${artifact}")"

echo
echo "Linux ARM64 package created successfully:"
echo "  ${final_artifact}"
echo
cat "${OUTPUT_DIR}/$(basename "${artifact}").sha256"
echo "ELF compatibility report:"
echo "  ${OUTPUT_DIR}/elf-compatibility.txt"
