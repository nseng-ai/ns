# @nseng-ai/pi-editor-mods

A composable Pi editor extension with two focused modifications:

- Shift+Enter and Alt+Enter always insert a literal newline.
- Existing local PNG, JPEG, WebP, and GIF paths compact to stable markers such as
  `[screenshot #3]` and attach the corresponding image when submitted.

The package root extension is the sole supported import. Editor factory composition, multiline
input, screenshot parsing, durable marker state, filesystem access, and editor behavior are private
implementation details. The decorators use Pi's concrete editor-factory chain rather than global
state.

## Enabled features

The extension entrypoint keeps the enabled feature set as one registration line per feature in
`src/extension.ts`:

```ts
export const enabledEditorModFeatures = [registerMultilineEditor, registerCondensedScreenshots];
```

Comment out either registration line to disable that feature. Each feature owns its lifecycle hooks
and composes through the shared editor-factory seam, so enabling or disabling one does not require
editing the other. A runtime configuration system can replace this source-controlled list later if
needed.

## Install

From npm:

```sh
pi install npm:@nseng-ai/pi-editor-mods
pi remove npm:@nseng-ai/pi-editor-mods
```

From a trusted git checkout:

```sh
git clone https://github.com/nseng-ai/ns.git
pi install /absolute/path/to/ns/ts/packages/tools/pi-editor-mods
pi remove /absolute/path/to/ns/ts/packages/tools/pi-editor-mods
```

For project-local development, paths in `.pi/settings.json` resolve relative to `.pi`:

```json
{
	"packages": ["../ts/packages/tools/pi-editor-mods"]
}
```

You can also run `pi install -l ../ts/packages/tools/pi-editor-mods` and remove it with
`pi remove -l ../ts/packages/tools/pi-editor-mods`.

## Screenshots

Image paths may be absolute, `~/...`, or local `file://` URLs, including quoted paths and common
shell backslash escapes. Existing input images are preserved. Newly resolved images are deduplicated
by normalized absolute path in first-reference order. `/screenshots` lists the active session
branch's markers numerically.

Marker identities are persisted as Pi custom session entries. Their stored values are normalized
**absolute local paths**, so session files disclose those paths and remain machine-specific. Missing
or stale files are skipped at submission without deleting their identity.

Large-paste expansion remains owned by Pi's built-in editor. Exact complete bracketed-paste payloads
and text inserted programmatically through Pi's optional editor insertion API—including Ctrl+V
clipboard images—compact supported existing image paths before delegation. This insertion-time step
checks that candidates are supported existing files, but does not read or encode image bytes. Paths
typed character-by-character remain raw while editing and resolve at submission.

Image bytes are read and attached only at submission. An uncompacted raw path is replaced with a marker
only after its image was read successfully; failed reads leave the raw text unchanged and allocate no
marker. A path compacted during paste or programmatic insertion already has a durable marker identity;
if its file later becomes stale, the marker retains that identity but attaches no image.

## Security

Pi packages and extensions execute with your **full user permissions**. This extension handles editor
input, reads image files explicitly referenced in prompts, and embeds their bytes in model input.
Project-local activation occurs only after Pi project trust. Install only from a source you trust and
do not reference sensitive images unless you intend to send them to the configured model provider.
The package does not upload independently; Pi's normal model transport handles attachments.
