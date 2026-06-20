# clinkr shell migration (branches 1–3: clinkr-parity-extensions, clinkr-shell, schema-routes)

## What landed

- **`pr-address-ts/clinkr-parity-extensions`** — three reusable extensions in `@asdl/clinkr`:
  - Strict-integer field kind: `z.int()` fields (detected via zod v4 `ZodNumber.format === "safeint"`) parse click-strict (`/^-?\d+$/`; `1e2`/`0x10`/`12.5` reject as exit-2 usage errors) on both options and positionals. Plain `z.number()` is unchanged.
  - `--format` choices widened to `human|json|markdown|md`; markdown/md collapse to the human renderer (Python clinkr parity). `ClinkrFormat` stays `"human"|"json"`.
  - `ClinkrCommandSpec.schemaDocument?: () => JsonSchemaDocument` override: `--json-schema` serves the supplied document verbatim, still eager (before zod validation). `JsonSchemaDocument` exported from the package index.
  - Downstream `plans`/`planned-branch` help and choice-error pins were recaptured from real commander output (the widened choice list changes every consumer's generated help).
- **`pr-address-ts/clinkr-shell`** — the full shell migration:
  - All 20 exec operations are clinkr command specs (`(ctx, request) => Promise<ClinkrExit<unknown>>` handlers) defined per-operation-file and assembled in `src/exec-commands.ts`, the single operation table (alphabetical = click help order). `defineExecOperation` (in `src/exec-operation.ts`, a separate module so operation files can import it without a cycle through the table) injects the pinned `schemaDocument` and the repo-context precondition wrapper for the 9 flagged operations.
  - `cli.ts`: clinkr root group (commander-generated help/version, hidden `exec` subgroup per repo convention) behind a pre-clinkr router that delegates **genuinely unknown** exec operation names to the legacy Python CLI verbatim. Test seam: `deps.registry` → `deps.operations`.
  - Deleted: `managed-options.ts`, `operation-registry.ts`, `parseReadOptions`/`parsePrNumberOperation`/`parseStrictInteger`, hand-written help, `parseFormatOptions`. `loadOperationPayload` now takes the parsed request record + stdin (option allowlists die; error wording and the pinned all-reference-backed stdin edge unchanged).
- **`pr-address-ts/schema-routes`** (thin): total-coverage guard in `json-schema-routes.test.ts` asserting the sweep buckets equal `EXEC_OPERATION_NAMES` exactly; docs scrub (`ts/packages/pr-address/README.md`, `.claude/skills/pr-address/references/cli-reference.md`) removing the claim that click usage errors render through the legacy Python CLI.

## Observable behavior changes (plan-settled decisions)

**For skill consumers, the usage-error channel shift is the headline:** argv errors that previously emitted `{"exit_code": 2, "error_type": "invalid_request", ...}` machine envelopes (even under `--format json`) are now raw stderr exit-2 commander usage errors — click parity. This covers strict-int rejections, unknown/missing options, excess arguments, and invalid enum choices. Post-parse domain validation (e.g. `body_chars must be between 1 and 4000`, empty-string checks, payload schema errors) keeps its machine envelopes byte-identically.

- Value-based legacy fallback collapsed: bogus `--payload-mode` (get-feedback, prepare-run) and `--stdout-mode` (stack-feedback-prep/-plan) values are strict-enum usage errors handled in TypeScript with **no legacy invocation**. Unknown-operation fallback is preserved.
- Repeated `--format` is commander **last-wins**. Probe evidence: the in-repo Python CLI (`pr-address-py exec classification-template --format human --format json`) emits the JSON envelope, i.e. Python is last-wins too — the old TS shim's first-wins was the parity bug.
- `exec` is hidden from top-level help (Python parity); `pr-address exec --help` lists all 20 operations with click-sourced descriptions.
- Options must precede `--` (click/commander semantics). The old shim stripped `--format` anywhere in argv, including after `--`; that quirk is gone.

## Gates passed

- Byte-unchanged: `json-schema-routes` parity suite + fixtures, `repo-context.test.ts`, machine-envelope fixtures across payload/classification/prepare-run/diff-current/finalization suites, legacy-gateway tests, wrapper shim test.
- Full TS workspace `check` + `test` green (144 files / 1913 tests).
- Manual smoke: real-CLI `--json-schema` for get-feedback byte-equals the builder output (note: `test/fixtures/json-schemas/*` are Python-captured documents compared structurally, not byte-diffed).
- New tests: hidden-exec help, strict-int through the real CLI path, `--format markdown|md` on an exec op, table↔builder 1:1, routes-sweep total coverage.

## Coordination

- `ts-clinkr-commander` roadmap pr-address row checked with a note that the consumer migration executed here and the framework gained the three parity extensions.
