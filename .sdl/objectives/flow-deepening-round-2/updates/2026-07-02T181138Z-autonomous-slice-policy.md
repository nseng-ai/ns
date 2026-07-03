# Migration slices moved to direct policy with a deterministic slice gate

## Summary

Owner decision (2026-07-02, in-session): the extraction migration row
changes from `Policy: preview` to `Policy: direct per slice` so the
remaining slices can execute autonomously under the autorun loop. The
per-slice human preview is replaced by a deterministic slice gate — every
check must hold to keep a slice:

- land scenario tests pass with unchanged argv assertions (byte-for-byte
  command construction);
- the full Definition of Progress suite is green;
- `sdl-flow/api` exports untouched;
- no behavior left orchestrated in both `land-stack/` and `land/` without
  a roadmap note naming the removing slice;
- gateway-interface changes limited to the methods the inventory map names
  for that slice.

Hard stop-and-ask triggers replace preview latitude: gateway changes
beyond the map's named methods, an unmeetable argv contract, or conflict
with the settled decisions below.

Design decisions settled to remove the migration's open steering points:

- **Isolated fast path** (map slice 3): remains a Flow-side shortcut but
  merges via the new `squashMergePullRequest` gateway method and gains the
  post-merge MERGED verification it currently skips. It does not become a
  domain target; CONTEXT.md's "Stack Landing Target" vocabulary is
  unchanged.
- **Progress reporting** (decisive for map slices 5–7): the
  operation-shaped command channel becomes the gateway backend, preserving
  per-command start/finish streaming and unchanged command output. This
  partially settles the "channel promotion trigger" open question; a
  neutral home still waits for a second consumer.
- **Slot freeing** (map slices 6 and 9): the `freeSlots` gateway method
  keeps shelling out to `sdl slot free`; only the call site moves behind
  the seam.

## Objective Impact

- The extraction blast-radius risk is now accepted rather than
  preview-mitigated: autonomous slices run against mechanical gates
  (argv-unchanged scenario tests are the primary tripwire) with automatic
  escalation for anything the inventory map did not anticipate.
- The Runner Policy, roadmap row, risk prose, and orientation were updated
  together; the migration row is now executable by `objective-next` /
  autorun without per-slice confirmation.
- No code changed in this update; the loop was not relaunched (owner asked
  for the record/policy change only).

## Follow-Ups

- When execution resumes, start at map slice 1 (strict merge gate +
  validator dedupe) and proceed in map order.
