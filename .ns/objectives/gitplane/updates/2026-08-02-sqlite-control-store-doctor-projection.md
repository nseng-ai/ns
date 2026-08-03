# Semantic Update: explicit SQLite initialization and core-owned doctor policy

## Summary

The v1 storage contract now makes SQLite control-schema initialization an explicit setup action through `initializeSqliteStore({ path, baseDirectory })`. Store opening, `doctor`, and future reconciliation never initialize or migrate schema. The lazy store factory receives an explicit read-only/read-write access request and a context containing both the package clock and absolute selected config directory; commands own and close one store per invocation.

Doctor adapters now return normalized control and target-schema introspection facts. Gitplane core owns stable checks, ordering, subjects, and pass/fail/unsupported policy. SQLite supports complete read-only introspection and adapter-owned JSON serialization without depending on JSON1.

Target writes preserve projection mode per physical column. Pure RFC 6901 projection maps missing and JSON null to backend null, carries JSON mode, and applies `clearFields`; SQLite performs one complete bound upsert for live/restored classified artifacts and deletion-only updates that preserve prior domain values. Generic artifacts remain control-plane-only.

## Objective Impact

This completes the SQLite control-store, target-projection, and read-only `doctor` roadmap slice and establishes the storage contract required by reconciliation.

## Follow-Ups

The next roadmap slice may implement cursor-diff reconciliation against this contract. It must not move control initialization or migration into command execution.
