# Performance Proof Standard Added

## Summary

The Objective now requires every test-boundary change that claims to make the default TypeScript test path faster to include performance evidence. The guidance calls for measured commands, comparable baseline and post-change timings, repetition or noise notes, and explicit accounting for whether cost was eliminated from the default path or shifted into the integration path.

## Objective Impact

This sharpens the Objective from "organize slow tests away from the default path" into an evidence-backed performance effort. Future roadmap slices should not rely on intuition that moving or faking a test made the suite faster; they should record enough timing evidence to prove the local/default-path improvement while preserving coverage in the integration suite.

## Follow-Ups

- Include the performance-proof standard in the integration-test layout and command-contract documentation slice.
- For each real Git, Node runtime, sqlite, or similar migration slice, record before/after timing evidence alongside coverage-preservation evidence.
