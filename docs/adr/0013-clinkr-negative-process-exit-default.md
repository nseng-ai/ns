# ADR 0013: Clinkr Negative Process Exit Default

## Status

Accepted

## Context

ADR 0010 established coarse Clinkr process exit semantics but deliberately left
`negative(...)` as a compatibility-sensitive follow-up: a rendered command could
produce a semantic negative result while still exiting process `0` unless the
caller supplied `--shell-exit-code`.

ADR 0011 then made the JSON machine envelope the detailed command-result surface.
That envelope already says `negative` has `exitCode: 1`, creating a split between
machine truth and default process behavior. Scripts and agents should not need a
second opt-in flag to make a result named `negative` shell-visible as non-success.

The customer-facing rule should be simpler than the historical implementation:
`ok(...)` is success, `negative(...)` is a valid invocation with a semantic
non-success result, and `failure(...)` / `ClinkrFailure` remain the framework or
command failure channel for this slice.

## Decision

`ok(...)` is the only rendered Clinkr success outcome and exits process `0`.

`negative(...)` means the command invocation was valid, but the command reached a
semantic negative or non-success result. It exits process `1` by default in human,
markdown, and JSON rendered modes. Its JSON machine envelope remains
`status: "negative"` with `exitCode: 1`.

Harmless empty or no-op results should not use `negative(...)`. They should return
`ok(...)` with explicit empty data and human output that explains the no-op.

`failure(...)` / `ClinkrFailure` and `usage_error` remain exit `2` for this slice.
ADR 0013 narrows any ambiguous ADR 0010 prose for Clinkr's current failure
channel: the practical taxonomy is `ok=0`, `negative=1`, and
`failure/usage_error=2`.

Clinkr removes `--shell-exit-code`. The flag is redundant once `negative(...)`
exits `1` by default, and keeping it would imply a compatibility mode that no
longer exists.

Clinkr removes `shellNegative(...)`. Command authors should use `negative(...)`
for semantic non-success and `ok(...)` for success, including empty success.

## Consequences

- Scripts get a simpler rule: rendered Clinkr results that are not `ok` are
  shell-visible non-zero.
- Human and markdown `negative(...)` messages go to stderr; JSON envelopes remain
  on stdout.
- Help text, completions, tests, and downstream snapshots that mentioned
  `--shell-exit-code` need migration.
- Existing command call sites must be audited: historical `negative(...)` uses
  that modeled harmless emptiness should become explicit `ok(...)` results.
- Clinkr still keeps the coarse failure channel at exit `2`; this ADR does not
  introduce a richer numeric exit-code taxonomy.

## Rejected Alternatives

- **Keep exit `0` by default and require `--shell-exit-code`.** This preserves
  compatibility but keeps machine envelopes and process behavior split in the
  common case.
- **Split success-like negatives and failure-like negatives into more variants
  now.** This would add taxonomy before command evidence proves the additional
  variants are necessary.
- **Change `failure(...)` to exit `1` in this slice.** That is a broader failure
  taxonomy change and would conflict with the current Clinkr failure channel.
- **Leave the decision deferred.** Deferral keeps a confusing flag and makes every
  caller remember that `negative` is not shell-negative unless opted in.
