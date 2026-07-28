# MCP Bundle Import Design

## Goal

Add first-class `.mcpb` import support to Aime Chat. Users can select a bundle from the MCP import dialog or drop one anywhere in the application window outside ChatInput. Every bundle is parsed and previewed before the user explicitly confirms installation.

## Scope

The feature includes:

- MCPB manifests 0.1 through 0.4.
- Node, Python, binary, and UV bundle server types.
- Official manifest validation, unpacking, signature inspection, required configuration checks, platform overrides, and variable substitution through `@anthropic-ai/mcpb`.
- Bundle metadata and signature preview before installation.
- Dynamic `user_config` fields for string, number, boolean, directory, and file values, including multiple file/directory values.
- Encrypted persistence for configuration marked `sensitive`.
- New installations and confirmed replacement or upgrade of an existing bundle.
- Application-wide drag and drop outside ChatInput.
- Chinese and English localization for all new visible strings.

The feature does not include:

- Operating-system file association, double-click handling, or “Open with Aime Chat”.
- Treating a `.mcpb` dropped on ChatInput as an installation request.
- Downloading bundles from URLs or an MCPB registry.
- Executing bundle code during preview.
- Automatically installing a missing Aime Chat runtime.

## Architecture

### Main-process MCPB manager

Create a focused main-process manager responsible for the bundle lifecycle. It exposes two IPC operations:

1. `previewMcpBundle(filePath)` validates the source file, checks the compressed size, verifies its signature, unpacks it into a temporary staging directory, parses `manifest.json`, checks compatibility, and returns renderer-safe preview data plus an opaque one-time token.
2. `installMcpBundle(previewToken, userConfig, replaceExisting)` revalidates the preview, validates user values, resolves the executable configuration, encrypts sensitive settings, and installs or replaces the tool.

The renderer never chooses the staging directory or final installation directory. A preview token maps to main-process-only state containing the source path, staging path, parsed manifest, signature result, and expiry. Tokens are single-use and expire after 30 minutes.

The compressed archive limit is 256 MiB. Files over the limit are rejected before the official unpacker reads the archive into memory. Only a file whose extension is `.mcpb`, case-insensitively, enters the preview path.

The manager uses these official package APIs:

- `unpackExtension` for safe bundle extraction, including path traversal rejection and executable permission restoration.
- `McpbManifestSchema` for manifest versions 0.1–0.4.
- `verifyMcpbFile` for signed, unsigned, and self-signed status.
- `hasRequiredConfigMissing` and `McpbUserConfigValuesSchema` for user configuration validation.
- `getMcpConfigForManifest` for platform overrides and variable substitution.

### Runtime configuration

For Node, Python, and binary bundles, the manager resolves `server.mcp_config` through the official package. For UV manifests that omit `mcp_config`, the manager generates the host-managed equivalent using Aime Chat’s existing UV runtime:

```text
<uv executable> run --project <installed bundle directory> <absolute entry_point>
```

Preview reports a blocking compatibility error when the current platform is excluded or the required Aime Chat runtime is unavailable. The dialog directs the user to Runtime Settings; it does not install a runtime as a side effect of importing a bundle.

### Persistent representation

Each installed bundle keeps the normal MCP tool identity and stores bundle-specific metadata in `Tools.value.mcpb`:

```ts
type InstalledMcpBundle = {
  bundleId: string;
  bundleName: string;
  bundleVersion: string;
  manifestVersion: '0.1' | '0.2' | '0.3' | '0.4';
  installPath: string;
  signature: {
    status: 'signed' | 'unsigned' | 'self-signed';
    publisher?: string;
    fingerprint?: string;
  };
  userConfig: Record<
    string,
    {
      sensitive: boolean;
      value: string | number | boolean | string[];
    }
  >;
};
```

Sensitive `value` data is represented in storage as an Electron `safeStorage` encrypted base64 string rather than the plaintext type shown in the logical model. Non-sensitive values remain JSON values. If encryption is unavailable, a bundle requiring a sensitive value is blocked from installation rather than stored in plaintext.

`Tools.mcpConfig` stores the unresolved manifest template. When the tool manager initializes, reconnects, enables, or upgrades a bundle-backed MCP, it reads the installed manifest, decrypts sensitive values in the main process, and generates the runtime-only resolved config. Decrypted values and resolved environment secrets are never persisted in `mcpConfig` and never returned to the renderer.

New bundles receive a generated `bundleId`; their final directory is `userData/mcp-bundles/<bundleId>`. A manifest-controlled name is never used as a filesystem path.

## Installation and upgrade flow

### New installation

1. Keep the parsed bundle in its temporary staging directory while the dialog is open.
2. Validate the submitted `user_config` values and generate a runtime configuration against the future final directory.
3. Move the staging directory to the generated final directory.
4. Persist the tool record and create the in-memory MCP client.
5. Emit `ToolEvent.ToolListUpdated` and navigate to the installed tool detail.
6. If persistence or client creation fails, delete the new directory and tool record.

New MCP tools retain the repository’s current default inactive state.

### Confirmed replacement or upgrade

An installed bundle is matched by `Tools.value.mcpb.bundleName`, not by its display name. Preview reports the installed and incoming versions and marks the operation as an upgrade, downgrade, or same-version replacement.

The install button is labeled `Confirm upgrade`, `Confirm downgrade`, or `Confirm replacement`. The IPC request must include `replaceExisting: true`; otherwise the main process rejects the operation even if the renderer has displayed a confirmation.

The manager performs replacement with a backup directory:

1. Move the old installed directory to a temporary backup path.
2. Move the new staging directory into the unchanged final path.
3. Generate the new runtime config and persist the updated bundle metadata.
4. Preserve the old tool ID and active state.
5. If the tool is active, initialize the replacement client before disconnecting the old client.
6. After the new record and client are ready, disconnect the old client and delete the backup.
7. On any failure, restore the old directory, database data, client, and active state.

## Import dialog

The existing add/edit MCP dialog keeps a top segmented control and adds a third mode:

```text
General | JSON | MCP Bundle
```

The General and JSON behavior remains unchanged except for using localized labels and a shared submitting state. The MCP Bundle mode has these states:

- Empty: a `.mcpb` drop area and a Select file action.
- Parsing: filename and progress indicator; the footer cannot submit.
- Invalid: a localized blocking error and Replace file action.
- Preview: bundle information, dynamic configuration, and final confirmation.
- Installing: inputs are disabled and the confirmation button shows progress.

The preview header shows the bundle icon only when its resolved path stays inside the staging directory, its file signature is PNG, and it is no larger than 1 MiB. The main process returns that icon as a data URL; otherwise the renderer uses a generic bundle icon. The header includes display name, description, author, current and incoming versions, runtime type, and signature status. A warning banner explains replacement behavior when an installed match exists.

The information section shows declared tool count, compatible platforms, resolved executable summary with sensitive values redacted, signer information, and an expandable technical-details region. It does not render untrusted bundle Markdown as HTML.

Dynamic configuration renders as follows:

- `string`: text input, or password input when `sensitive` is true.
- `number`: numeric input honoring `min` and `max`.
- `boolean`: switch.
- `directory`: Electron directory picker.
- `file`: Electron file picker.
- `multiple`: repeatable selected-path list.

Defaults are resolved through the official variable substitution rules before display. Required fields have an inline validation message and keep the install button disabled while missing or invalid.

An installed bundle is not editable through the raw General or JSON modes. Its existing Edit action opens the bundle configuration form so configuration can be changed without exposing unresolved templates or encrypted values. Existing sensitive values return only a `configured: true` marker to the renderer: leaving the password field empty preserves the encrypted value, while entering a new value replaces it.

## Application-wide drag and drop

A single renderer-level MCPB import controller is mounted above application routes. It owns the import dialog regardless of the current page and registers capture-phase `dragenter`, `dragover`, `dragleave`, and `drop` handlers.

ChatInput’s root form receives `data-mcpb-drop-exempt`. The controller checks the event target’s composed path:

- Inside a marked ChatInput, the controller does nothing and existing chat attachment handlers receive the event.
- Outside ChatInput, exactly one `.mcpb` displays the full-window bundle drop overlay and is intercepted on drop.
- Multiple files, mixed file types, or a non-MCPB file do not start an import. Existing page behavior remains available for non-MCPB files.

For an intercepted bundle drop, the capture handler prevents the default browser action and stops propagation before ChatInput’s document-level global attachment listener. Releasing the file opens the add MCP dialog on the MCP Bundle mode and starts preview.

Only one preview or installation can run at a time. A second drop during processing produces a localized “Bundle import is already in progress” toast.

## Error handling

Blocking errors include:

- Missing source file, wrong extension, or archive larger than 256 MiB.
- Corrupt ZIP, invalid signature block, path traversal, missing `manifest.json`, invalid manifest, or unsupported manifest version.
- Unsupported current platform or missing required runtime.
- Missing or invalid required user configuration.
- Sensitive configuration when Electron secure storage is unavailable.

Unsigned and self-signed bundles remain installable after the ordinary explicit installation confirmation, but the signature warning remains visible next to the confirmation action. Optional configuration omissions and unrecognized client-version constraints are non-blocking warnings.

Closing or cancelling the dialog invalidates its token and deletes its staging directory. Expired previews are cleaned on the next preview request and during application shutdown. Application startup removes stale staging and backup directories left by an interrupted previous process after first reconciling them with installed tool records.

All thrown main-process errors are mapped to stable MCPB error codes. The renderer translates codes into localized messages and does not display raw filesystem paths or stack traces.

## Testing

### Main-process tests

- Preview a valid official bundle fixture and return sanitized metadata.
- Reject a corrupt archive, traversal entry, absent manifest, invalid schema, unsupported version, and oversized source.
- Accept manifest versions 0.1–0.4 and resolve platform overrides.
- Resolve string, number, boolean, file, directory, multiple values, defaults, and `${user_config.KEY}` substitutions.
- Block missing required values and unavailable secure storage.
- Verify sensitive values are encrypted at rest and absent from persisted `mcpConfig`.
- Generate UV runtime configuration when `mcp_config` is omitted.
- Clean temporary state on cancel and expiry.
- Install a new inactive tool and emit the list-updated event.
- Require explicit replacement, preserve the tool ID and active state, and classify upgrade/downgrade/replacement.
- Restore directory, database record, and client when replacement fails.

### Renderer tests

- Render General, JSON, and MCP Bundle modes with localized labels.
- Select a file and display parsing, invalid, preview, and installing states.
- Render every `user_config` input type and enforce required/min/max validation.
- Display signed, unsigned, self-signed, upgrade, downgrade, and replacement messaging.
- Keep confirmation disabled until the preview and user values are valid.
- Open bundle-backed tools in configuration mode instead of raw JSON editing.

### Drag-and-drop tests

- Ignore a `.mcpb` dropped inside ChatInput.
- Intercept one `.mcpb` outside ChatInput and open the preview dialog.
- Reject multiple or mixed files without opening the dialog.
- Leave non-MCPB drops available to existing handlers.
- Ignore a second bundle while preview or installation is in progress.

### Verification gates

Run focused Jest suites for the manager, dialog, and global drop controller; run TypeScript checking for main, preload, and renderer contracts; run `git diff --check`; and perform a packaged-Electron smoke test using one valid bundle and one invalid bundle.

## Dependencies and localization

Add `@anthropic-ai/mcpb` as a production dependency. Do not invoke its CLI as a subprocess and do not copy its schema into the repository.

All visible copy, button labels, warnings, field validation, toasts, and error-code mappings are added to both `src/i18n/locales/zh-cn.json` and `src/i18n/locales/en-us.json`.
