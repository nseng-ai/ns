# Real Host Runner Removed

## Summary

Completed Batch 1 finding H by removing the dead `runner` field and constructor option from `RealAregHostGateway`. Host-tool discovery still scans the supplied `PATH`; no CLI behavior or gateway contract changed.

## Objective Impact

The host gateway no longer exposes a misleading runner injection seam for logic that does not execute commands. `RealAregGithubGateway` and `RealAregNpxSkillsGateway` still retain runner injection because they execute `gh` and `npx` commands and use command-runner fakes in tests.

Validation passed with `pnpm --dir ts run test -- ts/packages/areg/test/gateways/real-gateways.test.ts` (Vitest observed the full TS suite passing) and `pnpm --dir ts run check`. The caller audit found no repo-local `new RealAregHostGateway({ runner: ... })` construction sites.

## Follow-Ups

None for H. Continue with the remaining roadmap items in Batch 1.
