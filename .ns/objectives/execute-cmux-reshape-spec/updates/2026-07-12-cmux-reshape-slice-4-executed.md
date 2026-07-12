# Cmux Reshape Slice 4 Executed

## Summary

Slice 4 renamed the live `ns:ccc:*` command surfaces to `ns:cmux:*`, renamed
command constants and exported Pi registration symbols, re-minted the handoffs
extension ID, and moved the Pi extension adapter to `cmux.ts`. It also moved
all four `ccc-*` skills to `ns-cmux-*`, updated areg and installation metadata,
and recreated both agent and Claude symlink layers.

Pre-edit re-enumeration found two additional live exact-surface consumers in
the cmux and Pi-host glossaries. Only their exact command-surface literals were
changed, within Slice 4's rename intent. The historical `LEGACY_CCC_PREFIX`
guard remains unchanged.

## Objective Impact

Roadmap Slice 4 is complete on local branch
`cmux-reshape/rename-surfaces-and-skills`. Root `just` and `areg check` passed,
`areg skill find ns-cmux-sidebar` resolves, no live `ns:ccc:` exact-pair hits or
old skill paths remain, and all eight replacement symlinks resolve. Slice 5's
runtime configuration names remain unchanged.

## Follow-Ups

Proceed sequentially to Slice 5 on `cmux-reshape/ripple-renames`. Preserve the
breaking, no-alias/no-migration policy and include the staged-prompt and
environment-variable compatibility callouts in that step's report.
