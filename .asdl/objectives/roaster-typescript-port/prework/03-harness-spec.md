# Harness Spec (Slice 4) — highest risk

`harness/invocation.py` (+ `workflow.py` cap policy, prompts). The seam:
`HarnessGateway.runReview(request) -> ReviewExecutionResponse | Failure`, with a fake. Pure
functions (prompt assembly, diff-cap/coverage, output parsing) are extracted and unit-tested; the
real adapter takes an **injected `CommandExecApi`** (asdl-core exec). Per-line progress streaming is
dropped (CI-only). Stdin pump retained.

The two facts below were re-verified against source.

## 1. Claude Code argv (VERIFIED `invocation.py:250-279`)

```
claude -p --output-format json --bare
  --tools Bash,Read
  --model <request.model>
  --system-prompt <full text of review_system_findings.md>
  --json-schema <JSON.stringify(findings schema)>
```

- Binary literal `"claude"`; resolved via `which` (injectable `binaryLocator`); missing → return
  `HarnessBinaryMissing` **before** spawn.
- `--tools` is **variadic** — it MUST be followed by a flag. Keep `--model` immediately after the
  `Bash,Read` value. (A non-flag token after the tools value breaks parsing.)
- Tools are read-only (`Bash,Read`); Edit/Write deliberately excluded so a review can't mutate the
  repo.
- `--model`: validated **before** spawn — accept aliases `{sonnet,opus,haiku}` OR any string with
  prefix `claude-`; else `ModelNotSupportedByHarness`.
- `--system-prompt`: entire `review_system_findings.md` as one argv string (replace, not append).
- `--json-schema`: a **JSON-stringified single argument**, hand-written (no `$ref`/`$defs`). Fields
  `{path, line, severity, summary, details}` all required; `line` type `["integer","null"]`;
  `severity` enum `["info","warning","error"]`; `additionalProperties:false` at both object levels.
- No env set (inherits parent); no cwd set (inherits parent — load-bearing: `Bash,Read` run in the
  repo cwd).

## 2. stdin pump (`invocation.py:251-252, 478-547`)

- The **user prompt is sent via stdin, unconditionally** (no threshold) — so a large diff never
  triggers `E2BIG` at execve.
- Mechanism: write full prompt to stdin on a separate writer while concurrently reading stdout
  line-by-line (avoid the deadlock where stdout's pipe fills while you block writing stdin).
  Tolerate broken-pipe (claude may exit before reading all stdin); always close stdin.
- TS: use async streams; inject the process spawn through `CommandExecApi` (cleaner than Python's
  module-global `subprocess.Popen` monkeypatch).

## 3. Output parsing (`invocation.py:308-426`)

- **Exit first**: non-zero return → `HarnessExecutionFailed` (message = stderr, else last stdout
  line, else "exited with status N").
- Parse stdout as a **single JSON document** (`--output-format json --bare` emits one object). Two
  accepted shapes: a single object (the result event), or an array of events → scan for
  `type == "result"` (none → `ClaudeCodeInvalidResponse` "no terminal result event"). Empty stdout →
  `ClaudeCodeEmptyOutput`; bad JSON → `ClaudeCodeInvalidJson`.
- **Findings** come from `resultEvent.structured_output` → validate against the findings schema
  (`ClaudeCodeInvalidFindings` on mismatch). If `structured_output` missing but `result` (prose)
  present → `ClaudeCodeInvalidResponse` echoing prose truncated to 500 chars + "Confirm
  --json-schema is honored".
- **Usage** from the result event, all defensive: returns `null` (degrade, don't fail) if
  `total_cost_usd` not number, `duration_ms`/`num_turns` not int, `usage` not object, or any of
  `input_tokens`/`output_tokens`/`cache_creation_input_tokens`/`cache_read_input_tokens` not int.

## 4. Prompt assembly (`invocation.py:92-128`)

Two markdown assets (copy verbatim into `src/prompts/`):

- **System**: `review_system_findings.md` (trimmed), passed as `--system-prompt`. Instructs the
  model to call `StructuredOutput` once with `{findings:[…]}`, `line: null` for file-level findings,
  `{findings: []}` when nothing.
- **User**: `review_prompt.md`, assembled via Python `str.format` named fields: `review_name`,
  `review_description`, `review_instructions` (from `ReviewDefinition`); `base_ref`,
  `changed_path_count`, `changed_paths` (`- {path}` lines or "(no changed paths reported)"),
  `diff_block` (the capped diff in a fence). Final prompt `.strip()`ed.
- **Fence collision safety** (`_render_prompt_fence`): fence backtick count =
  `max(3, longestBacktickRun(content) + 1)`. A diff containing `` ``` gets a 4-backtick fence.
- Port note: replicate `str.format` named substitution exactly; literal braces in the template would
  be hazardous. (TS: a small named-substitution helper, not template literals over untrusted text.)

## 5. Diff-cap / coverage (`workflow.py` / `_prompt_sized_diff`, `:131-206`)

Constants: total `_MAX_PROMPT_DIFF_TOKENS = 120_000`; per-file `_MAX_PROMPT_DIFF_FILE_TOKENS =
40_000`. Token estimate = `ceil(codepoints/4)` per `02-§1`. **Total estimate is over the whole diff
text, not the sum of per-file estimates.**

Inclusion loop over `localDiff.files` **in diff order** (greedy, non-backtracking):

```
for f in files:
  if f.estimatedTokens > PER_FILE_CAP:           omit(reason="file_exceeds_cap"); continue   # strict >
  if includedTokens + f.estimatedTokens > TOTAL_CAP: omit(reason="diff_budget_exhausted"); continue  # strict >
  include(f.rawText); includedTokens += f.estimatedTokens
```

- Both comparisons strict `>` — a file exactly at a cap is **included**.
- Greedy and non-backtracking: a too-big file is skipped but later smaller files can still fit. No
  sorting; preserve diff order.
- **Coverage** (`ReviewInputCoverage`): `fullDiffEstimatedTokens` (whole-diff estimate), both caps,
  `changedPathCount` (= `len(changedPaths)`), `includedFileCount`, `omittedFileCount`,
  `omittedFiles[]` (each: path or "(unknown path)", changeKind, byteSize, estimatedTokens,
  added/removed, reason). Invariant: `omittedFileCount == omittedFiles.length` and
  `includedFileCount + omittedFileCount <= changedPathCount` (**`<=`, not `==`** — keep it).
- **Fast path**: if no omissions AND total ≤ TOTAL_CAP → send original `diffText` byte-for-byte (no
  reconstruction).
- **Capped path**: prepend a `# Roaster note:` header (full-diff estimate, both caps, one
  `# - {path} ({kind}, {bytes} bytes, ~{tokens} tokens, +{add}/-{rm}; {reason})` line per omitted
  file, reason underscores→spaces); body = included `rawText` segments joined (no separator; each
  carries its trailing newline). Empty body (all omitted) → header only.

## 6. Data shapes (`models.py`)

- Request: `HarnessReviewRequest { model, reviewDefinition, target: { localDiff } }`. `LocalDiff
  { baseRef, diffText }` with derived `files`/`changedPaths` (cached, so they can't drift).
- Success: `ReviewExecutionResponse { payload: FindingsReview, usage: ReviewUsage|null,
  inputCoverage: ReviewInputCoverage|null }`. `FindingsReview` serializes
  `{format:"findings", findings:[…], count:N}`. `ReviewFinding { path (non-blank),
  line: int|null (strict int), severity: "info"|"warning"|"error", summary (non-blank),
  details (non-blank) }`. `ReviewUsage` has the 7 fields;
  `totalInputTokens = input + cacheCreation + cacheRead`.
- Failures: the harness produces `HarnessBinaryMissing`, `HarnessInvocationFailed`,
  `HarnessExecutionFailed`, `ModelNotSupportedByHarness`, `ClaudeCodeEmptyOutput`,
  `ClaudeCodeInvalidJson`, `ClaudeCodeInvalidResponse`, `ClaudeCodeInvalidFindings` — redesign names
  idiomatically as discriminated-union values.

## 7. The fake

The Python fake subclasses `HarnessRuntime` and overrides only `run_review`, keyed by
`reviewDefinition.name`, recording requests, returning a default empty `FindingsReview`. In TS make
`HarnessGateway` an interface with a real adapter and an in-memory fake; the only contract that
matters is `runReview(request) -> ReviewExecutionResponse | Failure`.

## Must-match vs free

**Must match (external contract):** argv order/flags; `--json-schema` stringified single arg + field
set; prompt-via-stdin with no-deadlock + broken-pipe tolerance; findings from
`structured_output`; usage field names; `ceil(codepoints/4)` + strict-`>` greedy in-diff-order
inclusion; capped-header wording (echoed to model, asserted in tests); fence width formula; model
gating; `str.format` named substitution semantics; under-budget fast-path sends original `diffText`
byte-for-byte; coverage invariant `<=`.
**Free:** single-object-vs-array stdout handling (pick what the installed `claude` emits, keep the
"no result event" error); progress-event wording (dropped anyway); threading model;
500-char truncation; failure-type names; the fake-as-interface seam.

### TS test checklist (`tests/unit/test_harness_invocation.py`)

argv assertions: `--bare` present, `--verbose` absent, `--append-system-prompt` absent, no JSON
`$ref`s in schema, Edit/Write absent, `--tools` value followed by a flag; prompt-on-stdin (200KB
diff not in any argv token); non-zero exit → failure (stderr wins); per-file cap omits a file even
when total under cap; under-budget reports complete coverage; capped header + omitted-file line
format; fence collision safety. Plus direct tests for the cap loop and the parse functions.
</content>
