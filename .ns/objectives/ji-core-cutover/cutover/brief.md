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
  `SDL_SLUG_MODEL`, `SDL_TS_BAN_*`, `SDL_PI_CLI_TRACE*`,
  `SDL_KERNEL_DISABLE_FIRST_PARTY_EXTENSIONS`, justfile `SDL_TOOL` etc.). This
  covers every POSITION an env var NAME appears in: string values held in
  survivor-named constants (`SDL_PAYLOAD_ROOT_ENV = "SDL_PAYLOAD_ROOT"` — the
  identifier stays, the VALUE renames to `"JI_PAYLOAD_ROOT"`), `env.SDL_*` /
  `process.env.SDL_*` reads, and env-object fixture KEYS in tests
  (`{ SDL_TEST: "1" }` → `{ JI_TEST: "1" }`)
- sdl-brand artifact filenames in strings: `sdl-pi-cli-command-extension.jsonl` →
  `ji-pi-cli-command-extension.jsonl`
- snake_case machine codes: any `sdl_<anything>` string literal (diagnostic codes
  `sdl_extension_contribution_import_failed` → `ji_…`, `sdl_toml_invalid` →
  `ji_toml_invalid`, marker key `sdl_reviewer_marker` → `ji_reviewer_marker`)
- the PR-comment marker `<!-- sdl-reviewer:` → `<!-- ji-reviewer:` (owner decision
  2026-07-02: hard rename; pre-cutover GitHub PR comments stop being recognized —
  accepted)
- brand-named tmpdir/mkdtemp prefixes and brand fixture paths in tests:
  `"sdl-extension-project-"` → `"ji-extension-project-"`, `"sdl-worktree-footer-"` →
  `"ji-…"`, `"/tmp/sdl"` → `"/tmp/ji"`. EXCEPTION: prefixes deriving from surviving
  package/dir names keep their stem (`sdl-flow-real-gt-`, `sdl-capability-kit-…`
  survive because `sdl-flow`/`sdl-capability-kit` are survivor package names)

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
- website branding strings (`"sdl-docs"` site id, site titles) — branding row
- brand PROSE: bare or uppercase "SDL" used as the product name in sentences,
  doc/section titles, describe()/test() labels, and user-facing message prose
  ("Invalid SDL command candidate…", "SDL kernel", "an sdl checkout",
  "Extension manifest contains invalid SDL metadata") — owner decision 2026-07-02:
  deferred to the branding row; only the literal FORMS enumerated in the RENAME
  list above are in-window
- `ts/pnpm-lock.yaml` (regenerated), `state/vibechk` (deliberate non-sdl namespace)
- historical prose: archived objectives, `updates/` files, ADR body text (except the
  one allowlisted ADR 0005 fallback-path line). This includes historical FACTS in
  live docs — retired feature names narrated as the past stay verbatim (e.g.
  docs/README.md "Retired Python `sdl exec` commands"); the command was literally
  named that when it existed
- deliberate ABSENCE assertions: test code asserting old `sdl:*` names are GONE
  (`expect(pi.commands.has("sdl:flow:…")).toBe(false)` tombstones in
  flow/test/pi/sdl-extension.test.ts) keeps its old-name literals — they prove the
  rename happened

If an edit is ambiguous — you cannot tell a rename target from a survivor — do NOT
guess; record it in `skipped` with the file:line and why. Prefer a surfaced judgment
call over a wrong edit.
