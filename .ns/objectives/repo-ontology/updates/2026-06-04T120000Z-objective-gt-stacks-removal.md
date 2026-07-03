# Objective GT Stacks Removal

## Summary

The `objective gt stacks` projection surface was removed from the live Objective CLI and Pi extension plan. Repo ontology tracking no longer treats Objective GT stack projection or branch-graph vocabulary as current context ground truth to document.

## Objective Impact

Phase 10 should document the retained checkout-local `asdl-objectives` surfaces: list, archive, checked-in record status, and hidden exec helpers. It should not include Objective GT stack DTOs, `in-flight` projection status, branch slices, path-touch attribution, or `asdl-core.gt` branch-graph terms as live package vocabulary.

## Follow-Ups

- During the next `asdl-objectives` context pass, rederive vocabulary from the current source rather than from older roadmap language.
- During the final map pass, keep Graphite relationships only for packages and extension surfaces that still own live Graphite behavior.
