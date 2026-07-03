# Shared refactor brief (the `brief` field of cutover-plan.json)

You are renaming the product `ji` to `ns` in this repo. Hard cutover: no compat
codepaths, no fallbacks, no aliases. `ns` is always lowercase as the product name
(never `NS` or `Ns` in prose; `NS_*` env vars are ordinary env-var uppercase, not
brand casing). The repo tree you see has ALREADY had its file moves done (`.ji/` →
`.ns/`, `.pi/extensions/ji.ts` → `ns.ts`, the four `skills/ji-flow-*` dirs →
`skills/ns-flow-*`); your job is CONTENT edits only. Never rename, create, or
delete files. There is NO `ji.toml` move — that file and everything about it is a
later phase.

## ANCHORED FORMS ONLY — the cardinal rule

NEVER perform a bare `ji` → `ns` substitution. `ji` appears inside survivor tokens
(`@ji/`, `src/ji/`, `jicc`, `ji-command.ts`, `ji.toml`, objective slugs) and `ns`
already appears in this repo with unrelated meanings. You may ONLY rename the
anchored literal forms enumerated below, exactly where the anchor matches:

- the CLI name: subprocess argv `"ji"` → `"ns"`, `formatCommand("ji", …)`,
  `which ji` probes and their error text, `commandName: "ji"`, typed literals
  `command: "ji"`, `ji <subcommand>` instruction lines in prose/frontmatter/help
  text (live subcommands: address, aretro, branch-context, flow, handoff,
  objective, roaster, slot, shell, completion), `Usage: ji`, `bin ji` chains,
  backticked `` `ji …` `` command examples
- repo-state paths: `.ji/<anything>` → `.ns/<anything>` (e.g. `.ji/objectives`,
  `.ji/extensions`, `.ji/reviews`, `.ji/prompts`, `.ji/pi/agents`, `.ji/tmp`,
  `.ji/state/…`), the `.ji-workspace-ready.stamp` name, and bare `".ji"` /
  `".ns"`-bound segment literals like `parts[0] !== ".ji"`
- namespaces and machine keys: `/ji:` → `/ns:`, `ji:flow:*` → `ns:flow:*`,
  `ji:objective:*` (including the TEMPLATE form `` `ji:objective:${…}` ``),
  `ji:handoff:*`, `ji:plan:*`, `ji:branch-context:*`, `ji:cli:*`,
  `ji:typescript:*`, `"ji:pi-extension-command:finished"` → `"ns:…"`
- XDG namespaces: `state/ji`, `data/ji`, `config/ji`, `share/ji`, `tmp/ji`,
  `ji/slots` (also regex-escaped `ji\/slots`), `~/.ji` → the same with `ns`
- env var NAMES: `JI_<ANYTHING>` → `NS_<ANYTHING>` (e.g. `JI_CHECKPOINT_MODEL`,
  `JI_SLUG_MODEL`, `JI_TS_BAN_*`, `JI_PI_CLI_TRACE*`,
  `JI_KERNEL_DISABLE_FIRST_PARTY_EXTENSIONS`, `JI_CD_DIRECTIVE_FILE`, justfile
  `JI_TOOL` etc.). This covers every POSITION an env var NAME appears in: string
  values held in survivor-named constants (`SDL_PAYLOAD_ROOT_ENV =
  "JI_PAYLOAD_ROOT"` — the stale identifier stays, the VALUE renames to
  `"NS_PAYLOAD_ROOT"`), `env.JI_*` / `process.env.JI_*` reads, and env-object
  fixture KEYS in tests (`{ JI_TEST: "1" }` → `{ NS_TEST: "1" }`)
- the git ref namespace: `refs/ji/…` → `refs/ns/…`
- the shell-integration sentinels: `# >>> ji shell integration >>>` /
  `# <<< ji shell integration <<<` → ns forms, plus "ji shell integration"
  install/README prose
- brand artifact filenames in strings: `ji-pi-cli-command-extension.jsonl` →
  `ns-pi-cli-command-extension.jsonl`
- brand machine keys: `ji-command-ack`, `ji-command-progress`, `ji-cli-command`,
  `ji-cli-command-output`, `ji-harness-session-id` → `ns-*`
- snake_case machine codes: `ji_extension_contribution_import_failed` → `ns_…`,
  `ji_reviewer_marker` → `ns_reviewer_marker` (EXCEPTION: `ji_toml_invalid` is
  phase-two — see DO NOT TOUCH)
- PR-comment/body markers: `<!-- ji-reviewer:` → `<!-- ns-reviewer:`,
  `<!-- ji-pr-description:begin/end` → `<!-- ns-…`, generator version
  `ji-pr-description-v2` → `ns-pr-description-v2` (owner precedent 2026-07-02:
  hard rename; pre-cutover GitHub PR comments/bodies stop being recognized —
  accepted)
- brand-named tmpdir/mkdtemp prefixes and brand fixture paths in tests:
  `"ji-extension-project-"` → `"ns-…"`, `"/tmp/ji"` → `"/tmp/ns"`,
  `"/tmp/ji-directive"` → `"/tmp/ns-directive"`
- references to the four MOVED skill dirs: `skills/ji-flow-autobranch`,
  `skills/ji-flow-branch-latest-commit`, `skills/ji-flow-cp`,
  `skills/ji-flow-submit` and their bare skill names (`ji-flow-cp`, …) →
  `ns-flow-*` (these dirs were renamed in the bracket; prose/registry references
  must follow)
- live brand prose in the ROOT onboarding docs only where a changeset instruction
  says so (AGENTS.md, CLAUDE.md, README.md titles) — elsewhere brand prose defers
  (see DO NOT TOUCH)

## DO NOT TOUCH — phase-two surfaces (PR-5 owns these; baselines assert they are byte-identical)

- `@ji/*` package scope and every import specifier containing it
- `src/ji/` path segments, `./ji/` and `../ji/` relative imports, `/ji/commands`
  and `/ji/extension` path fragments, `join(…, "ji", …)` calls that build src-dir
  paths
- `ji-*.ts` / `ji-*.mjs` FILENAMES and the import subpaths that reference them
  (`../../submit/ji-runtime.ts`, `./pi/sdl-extension` export keys, …)
- the package.json extension-manifest KEY `"ji": {` in ALL manifests (including
  `.ns/extensions/*/package.json`), the schema/reads of that key (`manifest.ji`,
  `readonly ji?:`, `value.ji`, `"ji" in value`), and dotted manifest prose
  `ji.tier` / `ji.commands` / `ji.group` / `ji.subpackages` / `ji.remainder`
  — EXCEPTION: the kernel BIN key `"ji": "./src/cli/index.ts"` renames (it is the
  installed bin name, not the manifest key; see the kernel/package.json entry)
- `ji.toml` (the file, every reference to it, and the `ji_toml_invalid` code)
- `jicc` (package name, dir name, bin, prose)
- TypeScript/JS identifiers containing ji or sdl in any casing
  (`resolveSdlXdgPath`, `sdlShellIntegrationBeginMarker`, `SDL_DIRNAME`,
  `sdlExtension`, `jiToml`-style identifiers, …) — ONE exception, decided in cs2:
  `SDL_CD_DIRECTIVE_FILE` → `NS_CD_DIRECTIVE_FILE`

## DO NOT TOUCH — the ns collision register (frozen 2026-07-03, verbatim)

Pre-existing non-brand `ns` tokens. Never rename, "normalize", or brand-case
them; never "fix" them to something else:

- `ts/packages/infra/brmem/src/ref-layout.ts:9` — `export const BRMEM_NS_SEGMENT
  = "ns";` This is brmem's **namespace** ref segment: named Namespace Entries live
  under `refs/brmem/ns/<namespace>/<branch>`. Renaming it corrupts every existing
  brmem ref on every machine. Also lines 155, 183, 219 (segment interpolation,
  parse dispatch, prefix enumeration).
- `skills/brmem/SKILL.md:75, 78, 82, 94, 283` — `--namespace <ns>` CLI option
  placeholders in the brmem skill. `<ns>` abbreviates "namespace", not the
  product.
- `.ns/objectives/migrate-areg-and-ns-skills/` — closed Objective slug.
  Historical: `ns-*` was the skill prefix of the owner's old `nonslop` repo.
  Slugs are durable identity; never rename.
- Regex artifacts — ordinary identifiers that merely contain the byte sequence
  `NS_` (`PLANS_ERROR_TYPE`, `PI_EXTENSIONS_PACKAGE_ROOT`,
  `PI_EXTENSIONS_WORKSPACE_IMPORTS`, `TOKENS_COLUMN_WIDTH`,
  `MIN_TURNS_FOR_SEGMENTATION`, `DEFAULT_RUNS_LIMIT`, `RUNS_TABLE_COLUMNS`,
  `RUNS_DIR_NAME`). Not `ns` tokens at all; do not touch.

Because `ns` is an extremely common token, verification greps hunt LEFTOVER JI
ONLY — if you find yourself searching for `ns` to check your work, stop.

## DO NOT TOUCH — history and identity survivors

- historical prose: closed objectives, `.ns/objectives/**` record trees,
  `updates/` files, ADR body text (all of `docs/adr/`), migration evidence,
  `docs/ji-naming-brief.md` (superseded record — body stays verbatim). Historical
  FACTS in live docs stay verbatim too: retired feature names and past-tense
  narration ("the sdl→ji rename", "was previously `ji`") keep their old names
- ALL `sdl` historical mentions everywhere (two renames old; the branding row
  owns any live-doc SDL prose; sdl-named skill dirs like `sdl-typescript`,
  `sdl-cli-design`, `sdl-flow-submit`… did NOT move this window)
- objective slugs: `rename-sdl-to-ji`, `ji-core-cutover`, `rename-ji-to-ns`,
  `migrate-areg-and-ns-skills`, … (durable identity, even in live prose)
- brand PROSE outside the root onboarding docs: bare "ji"/"SDL" as a product name
  in sentences, doc/section titles, describe()/test() labels, and user-facing
  message prose defers to the branding row; only the literal FORMS enumerated in
  the RENAME list are in-window
- deliberate ABSENCE assertions: test code asserting old `ji:*` / `sdl:*` names
  are GONE keeps its old-name literals — they prove renames happened
- `ts/pnpm-lock.yaml` (regenerated by the bracket, never hand-edited)

If an edit is ambiguous — you cannot tell a rename target from a survivor — do
NOT guess; record it in `skipped` with the file:line and why. Prefer a surfaced
judgment call over a wrong edit.
