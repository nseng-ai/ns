# ADR 0001: Prose-only Synthesis Objectives

## Context

The existing fire-and-forget umbrella Objective pattern is useful when a parent only creates child Objectives and then stops tracking their work. The TypeScript toolchain port needs a different parent shape: child Objectives should own implementation details, but the parent should retain cross-child lessons, migration guides, synthesized outcomes, and closure evidence.

## Decision

Adopt **Synthesis Objective** as a prose-only Objective-system pattern. A Synthesis Objective may coordinate child Objectives, use parent roadmap rows such as `[~]` to show that a child exists and is in progress, and close only after child outcomes have been closed or explicitly parked and synthesized in the parent.

This is not a new Objective CLI feature, status model, registry, hidden metadata system, or task database. Child Objective records remain ordinary Objectives with deterministic `open`/`closed` status from the existing `closed.md` marker.

## Why

This preserves durable cross-child learning without mirroring every child roadmap or adding workflow-control semantics to Objective tooling. It also gives future agents explicit rationale for using a synthesis parent instead of incorrectly applying the fire-and-forget umbrella convention.
