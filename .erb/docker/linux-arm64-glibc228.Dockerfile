# syntax=docker/dockerfile:1.7

ARG NODE_BUILD_VERSION=22.16.0
ARG ELECTRON_VERSION=35.7.5
ARG ELECTRON_REBUILD_VERSION=3.7.2
ARG PNPM_VERSION=10.12.1
ARG FPM_VERSION=1.16.0
ARG MAX_GLIBC_VERSION=2.28
ARG MAX_GLIBCXX_VERSION=3.4.25

FROM quay.io/pypa/manylinux_2_28_aarch64 AS native-builder

ARG NODE_BUILD_VERSION
ARG ELECTRON_VERSION
ARG ELECTRON_REBUILD_VERSION

ENV PATH="/opt/node/bin:${PATH}"

RUN curl -fsSL \
      "https://nodejs.org/dist/v${NODE_BUILD_VERSION}/node-v${NODE_BUILD_VERSION}-linux-arm64.tar.xz" \
      -o /tmp/node.tar.xz \
    && mkdir -p /opt/node \
    && tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1 \
    && rm -f /tmp/node.tar.xz \
    && node --version \
    && npm --version

WORKDIR /native-app

COPY .npmrc /native-app/.npmrc
COPY release/app/package.json release/app/package-lock.json /native-app/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --include=optional --no-audit --no-fund

RUN --mount=type=cache,target=/root/.npm \
    mkdir -p /electron-rebuild \
    && npm install \
      --prefix /electron-rebuild \
      --ignore-scripts \
      --no-audit \
      --no-fund \
      "@electron/rebuild@${ELECTRON_REBUILD_VERSION}"

RUN --mount=type=cache,target=/root/.electron-gyp \
    /electron-rebuild/node_modules/.bin/electron-rebuild \
      --version "${ELECTRON_VERSION}" \
      --arch arm64 \
      --module-dir /native-app \
      --which-module better-sqlite3 \
      --force \
      --build-from-source

RUN file /native-app/node_modules/better-sqlite3/build/Release/better_sqlite3.node \
    && readelf -h /native-app/node_modules/better-sqlite3/build/Release/better_sqlite3.node \
      | grep -q "AArch64"

FROM ubuntu:22.04 AS package-builder

ARG NODE_BUILD_VERSION
ARG ELECTRON_VERSION
ARG PNPM_VERSION
ARG FPM_VERSION
ARG MAX_GLIBC_VERSION
ARG MAX_GLIBCXX_VERSION

ENV DEBIAN_FRONTEND=noninteractive
ENV CI=true
ENV PATH="/opt/node/bin:${PATH}"
ENV NODE_OPTIONS="--max-old-space-size=8192"
ENV WEBPACK_PARALLEL=false

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      binutils \
      build-essential \
      ca-certificates \
      curl \
      dpkg-dev \
      file \
      git \
      libffi-dev \
      make \
      python3 \
      ruby \
      ruby-dev \
      xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL \
      "https://nodejs.org/dist/v${NODE_BUILD_VERSION}/node-v${NODE_BUILD_VERSION}-linux-arm64.tar.xz" \
      -o /tmp/node.tar.xz \
    && mkdir -p /opt/node \
    && tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1 \
    && rm -f /tmp/node.tar.xz \
    && npm install --global "pnpm@${PNPM_VERSION}" \
    && gem install --no-document fpm --version "${FPM_VERSION}" \
    && node --version \
    && pnpm --version \
    && fpm --version

WORKDIR /workspace
COPY . /workspace

RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=cache,target=/root/.cache/electron \
    --mount=type=cache,target=/root/.cache/electron-builder \
    pnpm --config.package-manager-strict=false install --frozen-lockfile

COPY --from=native-builder \
  /native-app/node_modules/better-sqlite3/build/Release/better_sqlite3.node \
  /workspace/release/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node

RUN bash -euxo pipefail <<'EOF'
sqlite_path="release/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
sqlite_glibc="$(
  readelf --version-info "${sqlite_path}" \
    | grep -oE 'GLIBC_[0-9]+(\.[0-9]+)+' \
    | sort -Vu \
    | tail -1
)"

test -n "${sqlite_glibc}"
if dpkg --compare-versions "${sqlite_glibc#GLIBC_}" gt "${MAX_GLIBC_VERSION}"; then
  echo "better-sqlite3 requires ${sqlite_glibc}; maximum is GLIBC_${MAX_GLIBC_VERSION}" >&2
  exit 1
fi
EOF

# Keep the two webpack builds sequential. Docker Desktop often has a smaller
# memory limit than the macOS host, and the package scripts run them in parallel.
RUN npm run prepare:vc-redist \
    && npm run build:main \
    && npm run build:renderer

# npmRebuild must stay disabled here; otherwise electron-builder would replace
# the GLIBC 2.28 addon with an Ubuntu 22.04 rebuild.
RUN --mount=type=cache,target=/root/.cache/electron \
    --mount=type=cache,target=/root/.cache/electron-builder \
    USE_SYSTEM_FPM=true pnpm exec electron-builder \
      --linux deb \
      --arm64 \
      --publish never \
      -c.npmRebuild=false

RUN bash -euo pipefail <<'EOF'
deb_path="$(find /workspace/release/build -maxdepth 1 -type f -name '*-arm64-linux.deb' -print -quit)"
test -n "${deb_path}"

normalize_root="/normalized-root"
normalized_deb="/workspace/release/build/normalized-$(basename "${deb_path}")"

# electron-builder/fpm preserves the hard links it creates between /opt and
# /usr/share/icons. They cannot be installed when UOS mounts /opt and /usr on
# different filesystems, so materialize every hard link before the final build.
mkdir -p "${normalize_root}"
dpkg-deb --raw-extract "${deb_path}" "${normalize_root}"

hardlinks_before="$(
  find "${normalize_root}" -type f -links +1 -print \
    | wc -l \
    | tr -d '[:space:]'
)"

while IFS= read -r -d '' linked_file; do
  regular_file="${linked_file}.aime-chat-regular"
  cp --preserve=all --reflink=never "${linked_file}" "${regular_file}"
  mv -f "${regular_file}" "${linked_file}"
done < <(find "${normalize_root}" -type f -links +1 -print0)

if find "${normalize_root}" -type f -links +1 -print -quit | grep -q .; then
  echo "Failed to materialize all hard links in the Debian package tree." >&2
  exit 1
fi

dpkg-deb \
  --build \
  --root-owner-group \
  -Zxz \
  -z9 \
  "${normalize_root}" \
  "${normalized_deb}"
mv -f "${normalized_deb}" "${deb_path}"

dpkg-deb --fsys-tarfile "${deb_path}" | tar -tvf - > /tmp/deb-data-entries.txt
if grep -q '^h' /tmp/deb-data-entries.txt; then
  echo "The normalized Debian package still contains hard-link entries." >&2
  grep '^h' /tmp/deb-data-entries.txt >&2
  exit 1
fi

mkdir -p /audit-root /out
dpkg-deb --info "${deb_path}" > /out/package-info.txt
dpkg-deb --extract "${deb_path}" /audit-root

{
  file "${deb_path}"
  echo "Materialized hard-linked files: ${hardlinks_before}"
  echo "Archive hard-link entries: 0"
} > /out/artifact-file.txt
: > /out/elf-compatibility.txt

failed=0
while IFS= read -r -d '' binary; do
  if ! file -b "${binary}" | grep -q 'ELF'; then
    continue
  fi

  relative_path="${binary#/audit-root}"
  glibc="$(
    readelf --version-info "${binary}" 2>/dev/null \
      | grep -oE 'GLIBC_[0-9]+(\.[0-9]+)+' \
      | sort -Vu \
      | tail -1 || true
  )"
  glibcxx="$(
    readelf --version-info "${binary}" 2>/dev/null \
      | grep -oE 'GLIBCXX_[0-9]+(\.[0-9]+)+' \
      | sort -Vu \
      | tail -1 || true
  )"

  printf '%s\t%s\t%s\n' \
    "${glibc:-none}" \
    "${glibcxx:-none}" \
    "${relative_path}" >> /out/elf-compatibility.txt

  if [[ -n "${glibc}" ]] \
    && dpkg --compare-versions "${glibc#GLIBC_}" gt "${MAX_GLIBC_VERSION}"; then
    echo "ERROR: ${relative_path} requires ${glibc}; maximum is GLIBC_${MAX_GLIBC_VERSION}" >&2
    failed=1
  fi

  if [[ -n "${glibcxx}" ]] \
    && dpkg --compare-versions "${glibcxx#GLIBCXX_}" gt "${MAX_GLIBCXX_VERSION}"; then
    echo "ERROR: ${relative_path} requires ${glibcxx}; maximum is GLIBCXX_${MAX_GLIBCXX_VERSION}" >&2
    failed=1
  fi
done < <(find /audit-root -type f -print0)

sort -V -o /out/elf-compatibility.txt /out/elf-compatibility.txt

if [[ "${failed}" -ne 0 ]]; then
  echo "Linux ARM64 compatibility audit failed." >&2
  exit 1
fi

cp "${deb_path}" /out/
(
  cd /out
  sha256sum "$(basename "${deb_path}")" > "$(basename "${deb_path}").sha256"
)
EOF

FROM scratch AS artifact
COPY --from=package-builder /out/ /
