# Shared JSON Input Boundary

## Summary

PR #1011 promotes the reusable JSON option/stdin loader from `asdl-pr-address` into `asdl_core.clinkr.json_input` and updates the pr-address classification-template, classification-validation, and resolve-thread-batch helpers to import the shared Clinkr utility. The slice keeps pr-address-specific semantics in pr-address helpers while centralizing generic CLI JSON input handling.

Evidence: local branch diff against Graphite parent `shared-pr-address-json-input-loader`; PR #1011 (`Promote json_input from asdl-pr-address into asdl-core Clinkr; update all import sites`) corroborates the same file set.

## Objective Impact

This advances the managed run-state boundary work: generic JSON option/stdin parsing is now a shared CLI-layer utility, while raw feedback payloads, classification packets, validation behavior, and GitHub mutation semantics remain owned by pr-address-specific helpers. That reduces repeated helper plumbing without turning shared Clinkr infrastructure into a hidden pr-address workflow controller.

The change is progress, not closure. It does not by itself finish selected-detail artifact ergonomics, planning support, mutation skeletons, per-batch evidence, finalization, or the representative lower-orchestration proof.

## Follow-Ups

- Continue designing the normal pr-address run-state path so agents do not need ad-hoc `/tmp/pr-address-*.json` wrappers or mutation payload files.
- Verify future helper slices still keep pr-address judgment, validation, approval gates, and mutation semantics outside generic Clinkr utilities unless there is a direct pr-address simplification benefit.
