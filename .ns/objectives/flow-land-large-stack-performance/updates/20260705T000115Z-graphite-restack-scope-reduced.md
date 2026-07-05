# Graphite restack scope reduced

## Summary

Local branch `flow-land-large-stack-performance/targeted-graphite-refresh` adds a branch-only Graphite restack operation for required next-landing maintenance. Flow land now uses `gt restack --branch <branch> --only` for the rolling frontier branch while preserving optional descendant maintenance on `--upstack`, so the default linear landing path avoids repeatedly restacking the remaining stack.

Measured against the optimized current fake-backed large-stack scenarios:

- linear-11 improved from 154 to 145 total external calls.
- linear-25 improved from 336 to 313 total external calls.

The reduction comes from branch-only restacks and skipped downstream post-restack SHA rereads. Real Graphite wall-time improvement remains unproven until a human-driven large-stack run supplies wall-time evidence. Validation: the runner checkpoint for commit `0b4e39bf18b53abe0119c84d75ead51255584284` reports targeted Vitest coverage for Flow land adapter and scenario tests, `just ts-check`, formatter fixes, and final full `just` passing.

## Objective Impact

Advances the Graphite maintenance-cost row with measured fake-backed call-count evidence and a conservative restack-scope change. The Graphite bottleneck class now has a concrete call-count reduction while preserving cleanup guards and the serial landing safety model.

## Follow-Ups

- Human-driven real large-stack wall-time evidence is still needed to confirm whether the branch-only restack scope improves real Graphite latency.
- Optional descendant maintenance may have additional conservative scope-reduction opportunities.
- Remaining autorun-safe work should stay limited to narrow call-count reductions; direct merge-primitive changes remain steer-first.
