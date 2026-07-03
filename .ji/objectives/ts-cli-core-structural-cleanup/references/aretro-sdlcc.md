# aretro & sdlcc findings

Both packages are unusually disciplined at the parse boundary — no `any`, no
`as unknown as`, every external field through a typed accessor, `unknown`
narrowed before use, silent fallbacks mostly explicit warnings. No BLOCKERs. The
headline issues: a hand-rolled JSON-validation layer that should be Zod, dead
parsed data, and a parser/interpreter blend.

## sdlcc

### [HIGH] Hand-rolled boundary validation should be Zod

`stack-map-model-loader.ts:207-293` + `json-fields.ts` build a ~150-line manual
validation tower: `parseStackMapGraphData` collects six fields, a six-way
`=== undefined` gate (`:218-230`), and `branchArrayField`/`edgeArrayField`/
`slotArrayField` each re-implement "array of records, pull typed fields, bail to
`undefined` on any miss." The repo standard (AGENTS.md, `typescript-style`) is
Zod at boundaries. A single `z.object({ branches: z.array(branchSchema), trunk:
z.string(), ... })` with `.safeParse` replaces `parseStackMapGraphData`, all
three `*ArrayField` helpers, and most of `json-fields.ts`, yielding structured
error paths instead of the lossy flat message at `:228`. CONCRETE: define Zod
schemas for the `stack-map-branches` envelope and the cmux tree, `.safeParse`, map
`.error` into the existing `{type:"failure"; message}` shape. Biggest structural
win in either package.

### [HIGH] `edges` is parsed, validated, *required*, and never consumed

`stack-map-model-loader.ts:255-270` defines `edgeArrayField`; `:215,224` makes
`edges` a hard requirement (missing `edges` ⇒ whole load fails ⇒
`buildUnavailableStackMapModel`); yet `edges` has zero readers — the tree is built
entirely from `branch.parent`/`childrenByParent` (`:402-445`). Dead data that is
also a fragility multiplier: a producer that stops emitting `edges` silently
breaks the whole stack map for no functional reason. CONCRETE: delete
`StackMapGraphEdge`, `edgeArrayField`, the `edges` field, and its presence gate.

### [MED] `surfaceType` and `tty` parsed/normalized but never read

`stack-map-model-loader.ts:367` (`normalizeSurfaceType`) and `:357` (`tty`)
populate fields on `StackMapParsedCmuxTab`; no consumer anywhere.
`normalizeSurfaceType` (`:519-522`) exists solely to feed an unused field. Drop
both fields and `normalizeSurfaceType`.

### [MED] `parseMachineEnvelopeData` accepts non-numeric `exit_code` and stringifies it

`stack-map-model-loader.ts:197-202`: `const exitCode = parsed.exit_code; if
(exitCode !== 0) ... String(exitCode)`. `exit_code` is `unknown`; missing
(`undefined`) or string `"0"` both fail the `!== 0` check and get reported with
`String(exitCode)`. Functionally fails-closed but it's the one spot reading a raw
`unknown` field without a typed accessor while the rest is rigorous. CONCRETE:
`const exitCode = numberField(parsed, "exit_code")`, treat non-number as a
malformed-envelope failure distinct from non-zero exit.

### PASS — Graphite-boundary compliance & reuse

sdlcc does NOT parse human `gt` display output: reads `slot gt exec
stack-map-branches --format json` (`:146-150`) and `cmux tree --json --all`
(`:168`) — machine envelopes through plumbing, per the repo ban.
`command-runner.ts` is a correct thin re-export of `@asdl/core/exec`. Independent
loads parallelized via `Promise.all` (`:58-61`).

### File size — coherent split, no action

`stack-map.ts` (645) vs `stack-map-model-loader.ts` (522): split is coherent —
loader = IO + external-format parsing → `StackMapModel`; stack-map.ts = pure
model→state→render ("separate parsing from interpretation" done right). If
`stack-map.ts` grows further, lift the render block (`renderStackMapFrame` +
`formatStackMapTable*`, `:219-258,372-617` ≈ 280 lines) into `stack-map-render.ts`.
LOW priority.

## aretro

### [HIGH] pi-jsonl-source.ts (767) mixes three responsibilities

`parsePiJsonlSession` (`:69-174`) is simultaneously file reader, per-line type
dispatcher, AND semantic accumulator (owns `counts`, `toolCalls`,
`commandExecutions`, plus duplicated `bashExecution` handling at `:118-127` vs the
role path at `:360-371`). The file holds: (a) generic JSON accessors
(`objectFromValue`/`stringValue`/`intValue`/`firstIntValue`, `:704-767`), (b)
Pi-record interpretation (`:292-549`), (c) association/path logic
(`buildAssociation`/`sameOrChildPath`, `:551-615`). Remedy (same separation sdlcc
models): split `pi-json-accessors.ts` (the generic, format-agnostic helpers — not
Pi-specific) and keep `pi-jsonl-source.ts` for interpretation. This also exposes
that the generic accessors duplicate what a Zod-parsed record would give you.

### [MED] `bashExecution` handled on two code paths with subtly different accounting

Top-level record path (`:118-127`) manually does `addMessageCounts(...,
{command_execution: 1})` then calls `parsePiCommandExecution`. Message-role path
(`:360-371`) routes through `countMessageRole` (also `command_execution: 1`) then
`parsePiCommandExecution`. Two branches, two count mechanisms, one concept — a
future edit to one count rule silently diverges. CONCRETE: normalize a
`bashExecution` top-level record into the same `{role:"bashExecution", ...}` shape
and feed the single `parsePiMessage`/`countMessageRole` path, or extract one
`recordCommandExecution(record)` helper both call.

### [MED] JSONL parsing hand-rolled `unknown` narrowing where Zod is standard

`decodeJsonObject`/`coerceJsonObject`/`objectFromValue` (`:254-290,711-722`)
re-implement "is this a JSON object" + per-key extraction. The Pi JSONL is
heterogeneous per-line, so a single top-level schema is awkward — but a small
`z.object` per record type (`session`, `model_change`, `message`,
`bashExecution`) dispatched on `type` would replace
`parsePiModelEvent`/`parsePiMessage`/`parsePiCommandExecution`'s manual
field-picking with typed, warned failures. Lower-conviction than the sdlcc Zod
finding because the per-line union genuinely complicates a schema-first rewrite.
At minimum, acknowledge the generic accessors as a deliberate non-Zod choice.

### [LOW] many-spelling key aliases — deliberate but undocumented

`:449-450,468-470,526-534`: `firstIntValue` reads with key-aliases arrays (e.g.
`["input","inputTokens","input_tokens"]`) — three casings per field across five
fields. Acceptable for an external format you don't control, but worth a comment
naming *why* (Pi emits inconsistent casings across versions) so it reads as
deliberate, not accreted. `intValue` (`:748-757`) has exactly one caller
(`firstIntValue`, `:761`).

### [LOW] evidence.ts (586) cohesive — leave

`toolUsageItems`, `failedToolItems`, `repeatedFileReadItems`,
`repeatedShellCommandItems`, `largeOutputItems` (`:120-404`) all follow iterate
→ `Map<subject, Acc>` → `recordGroup` → emit. The accumulator infra (`:406-504`)
is already well-factored via `recordGroup` composition. Per-collector differences
(threshold gating, subject derivation, metadata) are real. Long but each function
small and uniform — verdict: leave despite triggering the size heuristic.

### PASS — reuse / boundary

`collect-evidence.ts` delegates repo-root and branch resolution to `context.git`
(`optionalRepoRoot`, `currentBranch`, `:160,255`) — does NOT reimplement git; the
gateway is injected via context. `sha256.ts` wraps `@asdl/core/primitives`.
