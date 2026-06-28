# Roaster command-face alignment

## Summary

Public Roaster guidance now treats the SDL command face as canonical. The GitHub Actions Roaster workflow invokes `pnpm --dir ts exec sdl roaster ...` for review discovery, review execution, and `exec publish-findings`; the public Roaster skills preserve their skill names and review keys while teaching `sdl roaster review run`, `sdl roaster exec record-findings`, and `sdl roaster exec publish-findings`.

`ts/packages/roaster/CONTEXT.md` now describes Roaster as an SDL Capability with a gateway-injected Domain Core, canonical `sdl roaster ...` Command Face, curated `@sdl/roaster/api` Capability API, Branch Memory review-log storage under `roaster` / `reviews/<review-key>/...`, and explicit GitHub publication boundary. `CONTEXT-MAP.md` was updated to match that capability framing, and the CLI conformance audit now distinguishes the remaining raw-command item as the standalone `roaster exec publish-findings` entrypoint because the SDL face is already enveloped.

## Objective Impact

This completes the roadmap row to align public skills, Pi metadata, docs, and context over the Roaster Capability boundary. The slice preserves review-definition format, review-log storage semantics, public skill names, and guarded publication behavior. The standalone `roaster` binary/package entrypoint remains intentionally present and compatibility-shaped for the next binary-disposition row.

Repo-local evidence did not find an active Pi `roaster:run:<key>` command registration; the stale public skill sentence was replaced with guidance to use the skill instructions or the same SDL command face in Pi-hosted sessions. Historical/provenance references in ADRs, closed Objectives, older prework, and standalone compatibility code were intentionally retained.

## Follow-Ups

- Decide and execute the standalone `roaster` binary cutover in the next roadmap row.
- Leave historical ADR/objective/prework references untouched unless a later slice finds a present-tense false claim that affects current guidance.
