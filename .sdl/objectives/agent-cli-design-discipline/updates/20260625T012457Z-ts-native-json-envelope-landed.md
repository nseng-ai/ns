# TS-Native JSON Envelope Landed

## Summary

Added `docs/adr/0011-clinkr-ts-native-json-envelope.md` and landed the corresponding TypeScript Clinkr machine-envelope reset. The new contract drops the old Python-parity snake_case envelope for TypeScript JSON output and standardizes on a camelCase discriminated envelope with `status`, `exitCode`, camelCase error fields, structured failure `data`, and a published machine-envelope JSON schema.

The implementation also envelopes JSON-mode usage and validation errors instead of emitting only raw stderr, and migrates downstream TypeScript package parsers, fixtures, and scenario tests to the new contract. Local/PR evidence for PR #2129 shows the work merged with commits `741bd4aa` and `17a6e5c`.

## Objective Impact

This resolves the Objective's core Python-parity/open-envelope question for TypeScript Clinkr and completes a substantial high-agreement Clinkr evolution slice. The Objective should no longer treat Python byte-identical envelope parity as a blocker for TypeScript machine-output design; remaining output questions are narrower output-volume decisions such as compaction, pagination/truncation, and streaming/JSONL.

The roadmap now marks ADR recording and high-agreement Clinkr implementation as in progress rather than untouched, with ADR 0010 and ADR 0011 as completed decision evidence.

## Follow-Ups

- Continue the ADR queue with output-volume strategy and confirmation/danger-tier decisions.
- Reflect ADR 0010 and ADR 0011 in the future `sdl-cli-design` skill.
- Decide whether to do the classified Clinkr audit as a retrospective gap list over the now-landed envelope changes plus remaining gaps, or to skip directly to the remaining ADR backlog.
