# Clinkr /app: no silent rendering — require `renderHuman` on data-bearing commands, remove the pretty-JSON fallback

## Objective

Encode the "no silent rendering" policy directly in `@nseng-ai/clinkr`'s modern `/app` surface:

- `resultSchema` **stays optional** — bodyless success (`ok()` → nothing on stdout, exit 0) remains a first-class concept.
- If a command declares `resultSchema` (data-bearing), `renderHuman` is **required** — at the type level and at the filesystem module-load gate.
- The pretty-JSON fallback (`envelopeJsonText(outcome.data)` when no renderer) is **deleted** from the `/app` rendering path.

This deliberately narrows the layering gap with `@nseng-ai/sdk` (which, as of commit `9e7e8db52` "Require explicit result schema and human renderer for SDK commands", requires *both* `resultSchema` and `renderHuman`). After this change the SDK remains stricter only by forbidding bodyless commands.

Breaking changes are explicitly fine (user-confirmed). clinkr is published to npm (`@nseng-ai/clinkr` versions `0.1.1`–`0.1.4` confirmed via `npm view`); the next publish should bump to `0.2.0` per pre-1.0 breaking convention, but **this change does not publish anything**.

## Grilled decisions (all user-confirmed)

1. **Scope: `/app` surface only.** `/legacy` (`src/legacy/emit.ts` `renderHumanChain`) and the old `src/group.ts` surface keep their pretty-JSON fallback untouched. packagechk and `ts/packages/public/sdk/src/cli/shell.ts` still consume `/legacy`; do not migrate them.
2. **JSON idiom: inline, no new export.** Machine-oriented commands whose human output is JSON use `renderHuman: (result) => JSON.stringify(result, null, 2)` inline. Do **not** export `envelopeJsonText` (or any new helper) from `/app` — the `/app` index has a deliberate comment refusing to export envelope internals, and the SDK migration in `9e7e8db52` used exactly this inline idiom across ~12 exec commands. Byte-identical to the current fallback (`JSON.stringify(value, null, 2)`).
3. **Type shape: discriminated pair.** Data-bearing arm: `resultSchema` required + `renderHuman` required + `renderMarkdown` optional. Bodyless arm: `resultSchema?: never`, `renderHuman?: never`, `renderMarkdown?: never` (all renderers forbidden). Keep two `defineCommand` overloads (context-free / contextful) over the union base; do NOT use conditional mapped types (bad TS diagnostics) or four overloads.
4. **Runtime gate: dedicated error.** The filesystem module gate emits a dedicated, actionable load-time error naming the violated coupling rule (e.g. "resultSchema declared without renderHuman" / "renderHuman/renderMarkdown declared on a command without resultSchema"), not a generic invalid-module rejection.
5. **README draft: minimal reword + one idiom sentence.** See README section below.
6. **Sequencing: one branch atop `sdk-required-result-schema-and-renderer`** carrying the enforcement plus ALL same-change syncs (gitplane renderer, sdk CONTEXT.md, ns-cli-design checklist, README draft + fixtures). Landing below the stack top would conflict with doc sentences it just rewrote.
7. **Versioning:** breaking is fine; note 0.2.0 for the next publish, no release work in this change.

## Ground-truth anchors (verified during planning; revalidate line numbers)

All paths relative to repo root.

- **Types:** `ts/packages/public/infra/clinkr/src/app/command-definition.ts` (~lines 132–205): `CommandDefinitionBase` currently has `resultSchema?: TResultSchema` and `renderHuman?:` optional; `ResultOf<TResultSchema>`; `ContextFreeCommandDefinition` / `ContextfulCommandDefinition`; `defineCommand` overloads use `TResultSchema extends ResultSchema = undefined` (the default is what makes bodyless `ok()` inference work — preserve that on the bodyless arm).
- **Module gate:** `ts/packages/public/infra/clinkr/src/app/selected-command.ts` (~lines 88–125): `STRUCTURED_DEFINITION_KEYS`, `isStructuredDefinition` shape-validates dynamically loaded `command.ts` modules. Types alone cannot protect this path. The guard is currently boolean; producing the dedicated error may require restructuring how the caller reports invalid modules — inspect the call site's error surface.
- **Fallback to delete:** `ts/packages/public/infra/clinkr/src/app/app.ts`, `renderOutcomeView` (~line 795): `renderer === undefined ? envelopeJsonText(outcome.data) : renderer(...)`. Keep the `renderMarkdown ?? renderHuman` md-format fallback and the ANSI `boundaryText` enforcement.
- **Why removal is safe:** `ts/packages/public/infra/clinkr/src/app/outcome.ts`, `decodeCommandOutcome` (~line 160–171) already throws `"clinkr: success outcome data requires a resultSchema"` when a bodyless definition returns `ok(data)`. Once the type pair + module gate guarantee data-bearing ⇒ renderer, the fallback branch is provably dead.
- **Helper provenance:** `ts/packages/public/infra/clinkr/src/envelope-json-text.ts` is `JSON.stringify(value, null, 2) ?? String(value)`, exported only from `/legacy`. Leave exports as-is.
- **`/app` export boundary:** `ts/packages/public/infra/clinkr/src/app/index.ts` has an explicit comment that envelope internals (`buildEnvelopeSchema`, `exitCodeFor`, `toEnvelope`) are deliberately not exported. Honor it.
- **`--json-schema` unchanged:** `buildCommandJsonSchemaDocument` keeps `outputJsonSchema: {}` for bodyless.

## Change inventory

### 1. clinkr types — `src/app/command-definition.ts`
Split `CommandDefinitionBase` into the discriminated pair (decision 3). Compose with the contextful/context-free axis so the matrix stays 2 overloads × union base. `ResultOf` unchanged. Verify bodyless inference: `defineCommand({ schema, handler: async () => ok() })` must still compile without type arguments.

### 2. clinkr module gate — `src/app/selected-command.ts`
Add coupling invariants to `isStructuredDefinition` (or its caller): `resultSchema` present ⇒ `renderHuman` is a function; `resultSchema` absent ⇒ `renderHuman`/`renderMarkdown` absent. Emit the dedicated error (decision 4), ideally including the command path shown by existing invalid-module errors.

### 3. clinkr rendering — `src/app/app.ts`
Delete the `envelopeJsonText` fallback branch in `renderOutcomeView`. After this, `app.ts` may no longer need the `envelopeJsonText` import for rendering (it still uses it for `--json-schema` output at ~line 410 — keep that).

### 4. gitplane migration (only live `/app` consumer relying on fallback)
`ts/packages/incubating/infra/gitplane/src/cli/commands/reconcile/command.ts` is data-bearing without `renderHuman`. Add the inline JSON idiom renderer (byte-identical output to today).

### 5. clinkr tests and fixtures
Audit and fix; distinguish **incidental** fallback reliance (add renderer, keep test intent) from **deliberate** fallback assertions (rewrite to assert the new dedicated gate error, or delete).

Data-bearing without `renderHuman` found during planning:
- Fixtures: `test/fixtures/argv-projection/command.ts`, `test/fixtures/contextful-greet/command.ts`, `test/fixtures/echo-outcome/command.ts`, `test/fixtures/misbehaving/command.ts` (misbehaving may be *intentionally* invalid — check each test's intent before "fixing").
- Inline definitions: `test/app-composition.test.ts`, `test/app-navigation.test.ts`.
- README type-test examples (must move in lockstep with README snippets): `test/type/readme-examples/03-projection-fragment.ts`, `04-find/command.ts`, `09-completion.ts`, `13-schemas.ts`.

Pretty-JSON stdout expectations likely to change (audit; found via `\n  "` heuristic): `test/app-composition.test.ts`, `test/format-option.test.ts`, `test/rendering.test.ts`, `test/app-public-seam.test.ts`, `test/dispatch.test.ts`, `test/app-raw-dispatch.test.ts`. Note `test/exit.test.ts` imports from `/legacy` — **out of scope**, do not touch.

Add type tests proving the policy (mirror the SDK's pattern in `ts/packages/public/sdk/test/type/sdk-types.ts`): `resultSchema` without `renderHuman` is a compile error; any renderer on a bodyless definition is a compile error; bodyless `ok()` inference still works; discriminated-union results narrow in the renderer.

### 6. README draft + executable fixture lockstep
The draft README is `.ns/objectives/clinkr-readme-driven-development/references/README-draft.md`. `ts/packages/public/infra/clinkr/test/readme-examples.test.ts` maps README code fences **by ordinal** (`FENCE_REGIONS`) to fixture regions — snippet edits can renumber fences; keep the map in sync.

Edits (decision 5 — minimal):
- Section "Human, Markdown, and JSON output": reword "A rendered command may provide separate command-level renderers for successful results" → data-bearing commands **must** provide `renderHuman`; `renderMarkdown` stays optional and falls back to `renderHuman`.
- Add exactly one sentence teaching the inline idiom: machine-oriented commands whose human representation is JSON declare `renderHuman: (result) => JSON.stringify(result, null, 2)`.
- Keep bodyless prose untouched, including "A command without `resultSchema` emits bodyless success envelopes."
- The `contacts find` snippet says "// result schema, handler, and renderers..." — fine as-is, but its type-test mirror (`04-find/command.ts`) needs a real renderer to compile.

### 7. Doc syncs (same change — ground truth ↔ docs rule)
- `ts/packages/public/sdk/CONTEXT.md`: the sentence "This is stricter than generic Clinkr, which keeps bodyless commands and fallback rendering for lower-level consumers" — the fallback clause becomes false. Reword: SDK remains stricter only by requiring a result schema (no bodyless commands); clinkr `/app` now also requires `renderHuman` for data-bearing commands.
- `skills/internal/agent-engineering/ns-cli-design/references/checklist.md` (~lines 11–14): "…deterministic JSON renderer instead of relying on fallback rendering" — fallback no longer exists at the clinkr `/app` layer; reword.
- `skills/internal/agent-engineering/ns-cli-design/SKILL.md` (~lines 59–62): check the flow description for fallback mentions; sync if stale.
- clinkr in-package docs: `docs/terminal-integration-testing.md` has no fallback mentions (verified); no in-package README exists yet (the draft is it). No clinkr CONTEXT.md fallback mentions found.
- `ts/packages/public/sdk/README.md`: the added paragraph from `9e7e8db52` doesn't reference clinkr's fallback; likely no change, but verify.

### Explicitly unchanged (state in the PR description)
JSON format path and machine envelope shapes; `--json-schema` document (bodyless keeps `outputJsonSchema: {}`); negative/failure/usage-error rendering; raw commands; completion; `/legacy` and `src/group.ts` surfaces; `decodeCommandOutcome` validation.

## Sequencing / branch mechanics

- Base branch: `sdk-required-result-schema-and-renderer` (top of the in-flight stack; its parent is `flow-conformance-required-sdk-renderers`). Create ONE new branch on top with Graphite (`gt create`), per the code-graphite skill. Never commit on main/master.
- All items above land in that single branch as one reviewable unit; splitting would leave a mid-stack state where clinkr rejects gitplane/fixtures.

## Validation

Run relevant targeted validation (clinkr package tests including type tests and readme-examples gate, gitplane tests, sdk type tests); broaden to `just` since this touches a shared public package consumed across the workspace. If `dprint check` fails, run `just dprint-fix`. Document commands run plus any unrelated blockers. See `ts/AGENTS.md` before editing `.ts` files.

## Provenance

- Design settled in a grilled planning session (pi-grill-ui); all seven decisions user-confirmed, plus explicit "breaking changes are fine."
- SDK precedent and layering rationale: commit `9e7e8db52` ("Require explicit result schema and human renderer for SDK commands") — its message explicitly kept "Generic Clinkr's bodyless/fallback contracts … unchanged"; this plan is the deliberate follow-up that tightens the clinkr `/app` half.
- npm publication state checked live: `npm view @nseng-ai/clinkr versions` → `["0.1.1","0.1.2","0.1.3","0.1.4"]`.
- Objective context: `.ns/objectives/clinkr-readme-driven-development` — teaching boundary settled 2026-07-25 (primary narrative teaches core workflows; low-level APIs route to exported types), which is why the README delta is minimal.
