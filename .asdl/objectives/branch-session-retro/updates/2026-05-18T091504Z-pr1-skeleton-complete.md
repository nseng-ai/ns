# PR 1 Skeleton Complete

## Summary

The `asdl-retro` workspace package skeleton now exists with a standalone `branch-retro` CLI, asdl plugin registration, an outer `branch-retro` group, and a hidden empty `exec` subgroup.

Validation passed with targeted scenario/plugin tests and the full repository `just` suite.

## Objective Impact

This completes roadmap PR 1 and validates the assumption that existing asdl package and CLI conventions are sufficient for the new retrospective package skeleton. Later work can build the Pi JSONL adapter and `branch-retro exec collect-evidence` operation on this package boundary.

## Follow-Ups

- Start PR 2 by adding the Pi JSONL session source adapter and core parser models with unit coverage.
- Keep `exec` hidden and avoid adding semantic recommendation logic to Python as collector work begins.
