# Shared refactor brief (the `brief` field of cutover-plan.json)

You are renaming the product `sdl` to `ji` in this repo. Hard cutover: no compat
codepaths, no fallbacks, no aliases. The repo tree you see has ALREADY had its file
moves done (`.sdl/` → `.ji/`, `sdl.toml` → `ji.toml`, `.pi/extensions/sdl.ts` →
`ji.ts`); your job is CONTENT edits only. Never rename, create, or delete files.

RENAME these literal forms wherever they appear in your assigned file(s):

- the CLI name: subprocess argv `"sdl"` → `"ji"`, `formatCommand("sdl", …)`,
  `which sdl` probes and their error text, `sdl <command>` instruction lines in
  prose/frontmatter/help text, `Usage: sdl`, "… for sdl."
- repo-state paths: `.sdl/<anything>` → `.ji/<anything>` (e.g. `.sdl/objectives`,
  `.sdl/extensions`, `.sdl/reviews`, `.sdl/prompts`, `.sdl/pi/agents`, `.sdl/tmp`,
  `.sdl/state/…`)
- namespaces and machine keys: `/sdl:` → `/ji:`, `sdl:flow:*` → `ji:flow:*`,
  `sdl:objectives:*` → `ji:objectives:*`, `"sdl:pi-extension-command:finished"` →
  `"ji:…"`, diagnostic codes `missing-sdl` / `extension_manifest_missing_sdl` →
  `missing-ji` / `extension_manifest_missing_ji`
- XDG namespaces: `state/sdl`, `data/sdl`, `config/sdl`, `share/sdl`, `sdl/slots`
  (also regex-escaped `sdl\/slots`), `~/.sdl` → the same with `ji`
- the package.json manifest KEY `"sdl":` → `"ji":` and dotted prose forms
  `sdl.tier` / `sdl.commands` / `sdl.group` / `sdl.subpackages` → `ji.*`
- config filename references: `sdl.toml` → `ji.toml`
- env var names: `SDL_<ANYTHING>` → `JI_<ANYTHING>` (e.g. `SDL_CHECKPOINT_MODEL`,
  `SDL_SLUG_MODEL`, `SDL_TS_BAN_*`, `SDL_PI_CLI_TRACE*`, justfile `SDL_TOOL` etc.)
- sdl-brand artifact filenames in strings: `sdl-pi-cli-command-extension.jsonl` →
  `ji-pi-cli-command-extension.jsonl`

DO NOT TOUCH (out-of-window survivors; later roadmap rows own them):

- `@sdl/*` package scope and every import specifier containing it
- TypeScript/JS identifiers containing sdl in any casing (`resolveSdlXdgPath`,
  `sdlToml`, `sdlExtensionManifestSchema`, `SdlCommandInfo`, `buildSdlCompletionScript`, …)
- `src/sdl/` path segments, `./sdl/` and `../sdl/` relative imports,
  `/sdl/commands` and `/sdl/extension` path fragments, `join(…, "sdl", …)` calls that
  build src-dir paths (e.g. module-loader.ts)
- bare `"sdl"` VALUES inside package.json `subpackages` arrays
- package/dir/file NAMES: `sdl-flow`, `sdl-capability-kit`, `sdlcc`, `sdl-tools`,
  skill directory names (`sdl-flow-submit`, `sdl-typescript`, `sdl-cli-design`,
  `sdl-typescript-style-tripwire`), source filenames (`sdl-extension.ts`,
  `repo-local-sdl-extension.ts`), objective slugs (`rename-sdl-to-ji`, …)
- `SPECIALIZED_SKILL_REPLACEMENTS` keys (skill dir names); only its VALUES rename
- docs-site branding strings (`"sdl-docs"` site id, site titles) — branding row
- `ts/pnpm-lock.yaml` (regenerated), `state/vibechk` (deliberate non-sdl namespace)
- historical prose: archived objectives, `updates/` files, ADR body text (except the
  one allowlisted ADR 0005 fallback-path line)

If an edit is ambiguous — you cannot tell a rename target from a survivor — do NOT
guess; record it in `skipped` with the file:line and why. Prefer a surfaced judgment
call over a wrong edit.
