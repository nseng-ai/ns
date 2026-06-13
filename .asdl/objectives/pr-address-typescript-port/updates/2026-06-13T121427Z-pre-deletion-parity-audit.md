# Pre-deletion deep parity audit (Python pr-address → TS)

## Summary

A deep, command-by-command behavioral audit of the Python `pr-address` exec CLI against
the TypeScript port was run as a final sanity check before Python deletion. Six parallel
deep-comparison passes read both implementations in full — every exec command plus the
supporting modules, schemas, and GitHub/git gateways on both sides.

**Conclusion: the TS port is at parity or a strict superset for all 19 Python exec
commands. The divergences found are not sufficient to block deletion of the Python
package.**

### Command surface

- All **19** Python exec commands have 1:1-named TS counterparts with matching core logic.
- TS adds **2 net-new commands with no Python lineage**: `map-branch-prs` and
  `stack-feedback-preflight`. The `stack-address` skill already invokes
  `stack-feedback-preflight`, so the skills already depend on TS-only behavior — Python was
  never their complete backing.

### Confirmed at full parity (load-bearing surfaces)

- **GitHub writes** (`reply-to-*`, `resolve-thread-*`): GraphQL mutations and REST
  endpoints byte-identical, including reply-body formatting, the
  `<!-- pr-address:resolved -->` marker, planned-provenance blocks, and timestamp format.
  Nothing written to GitHub changes.
- **On-disk layout & persisted state** (`prepare-run`, `record-batch-checkpoint`,
  `finalize-run`): payload directory layout, filename pattern, `0700`/`0600` permissions,
  and JSON serialization are byte-matched — TS explicitly reproduces Python's
  `json.dumps(indent=2)+"\n"` with `ensure_ascii` `\uXXXX` escaping.
- **Payload-builder decision logic** and **classification/validation** (error codes, paths,
  messages, batching order, category enums): faithful ports, including Python-repr
  byte-parity on pointer rendering.
- **Classification template**: structured JSON scaffold, byte-for-byte equivalent (no prose
  template exists to drift).

## Findings — none block deletion

### One genuine regression (TS weaker than Python), low severity

- **`read-feedback-detail` (singular)**: TS validates only the `.raw.json` filename suffix
  then does a plain `readFile`/`JSON.parse` (`read-feedback-detail.ts:284-292`), bypassing
  Python's full payload-path contract (absolute path, no symlink, must live under
  `sessions/<id>/payloads/`, role check). It also uses a private JSON-pointer resolver with
  different not-found/out-of-range error messages.
- **Blast radius: negligible.** The skills drive the **plural** `read-feedback-details`
  (full parity) in the automated flow; the singular command is documented as a one-off
  inline lookup / debug check only (`skills/pr-address/SKILL.md:235,325`) and is in no
  automated path. Optional hygiene fix on the TS side; not a deletion blocker.

### Minor, non-blocking (all supersets or cosmetic)

- **Input-surface supersets (TS ⊇ Python):** `--payload-file` on `plan-feedback` and both
  payload builders; `--stack-plan-reference` / `--prep-reference` / `--stack-reference`
  artifact-reference paths across stack commands. TS accepts everything Python does, plus
  more.
- **Error-wording / exit-code drift on malformed input only:** wrapper-payload strictness
  (Pydantic required-keys → exit 2 vs Zod `looseObject` → exit 1 validation envelope);
  invalid-mode and bad-`--provenance-json` message text. Well-formed inputs behave
  identically.
- **`resolve-thread-with-reply` single command:** TS is _stricter_ (rejects empty
  `thread_id`, wraps gh failures as `pr_gateway_failure`); Python would pass an empty thread
  to GitHub / raise uncaught. TS is the safer side.
- **`stack-feedback-prep` fetch concurrency:** Python sequential, TS `Promise.all` then
  sequential writes — result shape/ordering preserved by design.
- **Exotic-line-separator quoting** in discussion replies (Python `splitlines()` vs TS
  `\n`-only) — only differs on `\v`/`\f`/`` etc. in original bodies; vanishingly
  unlikely in review text.

## Objective Impact

- This audit closes the open question of whether the Python exec CLI retains behavior the
  TS port lacks. It does not. Python deletion (the `python-deletion` endgame branch) is not
  gated on any remaining parity gap.

## Follow-Ups

- **Retire parity test fixtures that assert Python's narrower flag sets.** Several TS
  commands are input-surface supersets (`--payload-file` on `plan-feedback` and the payload
  builders; the `--*-reference` artifact-reference flags on the stack commands). Any fixture
  asserting Python's narrower option set — or asserting that those flags are _rejected_ —
  will fail once Python is deleted and must be retired as part of `python-deletion`.
- During `python-deletion`, remove the TS legacy-Python fallback router
  (`ts/packages/pr-address/src/cli.ts:51-61`) in the same change that deletes the Python
  package; it shells unknown exec operations to Python and would dangle otherwise.
- Optional: tighten singular `read-feedback-detail` payload-path validation in TS for parity
  hygiene (not required for deletion).
