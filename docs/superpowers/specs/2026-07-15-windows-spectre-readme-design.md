# Windows Spectre Build Prerequisite Documentation

## Goal

Document the Visual Studio component required for Windows developers to complete `pnpm install` when native Electron dependencies such as `node-pty` are rebuilt.

## Scope

- Update both `README.md` and `README_CN.md`.
- Add a short Windows-specific note immediately after the existing prerequisites list.
- Name the required Visual Studio Installer component exactly:
  - English: `MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (v14.42-17.12)`
  - Chinese: `MSVC v143 - VS 2022 C++ x64/x86 Spectre 缓解库 (v14.42-17.12)`
- Explain that the component is needed to rebuild native dependencies such as `node-pty` and that its absence can cause `MSB8040` during `pnpm install`.

## Placement and Style

Use a compact `Windows Development Prerequisite` / `Windows 开发环境要求` subsection between the general prerequisites and dependency-installation sections. Match the language and Markdown structure of each README without changing unrelated content.

## Verification

- Confirm both README files contain the exact versioned component name.
- Confirm both notes mention `node-pty`, `pnpm install`, and `MSB8040`.
- Review the diff to ensure no unrelated README content changed.
