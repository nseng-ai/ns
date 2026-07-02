# Subpackage Conformance Guard Implemented

## Summary

The TypeScript style guard now enforces declared-state conformance for packages that opt into `sdl.subpackages` or `sdl.remainder`. Named subpackages must exist as `src/<name>/` directories, and declaring packages without `sdl.remainder: true` fail when source files live outside declared subpackage directories.

## Objective Impact

This completes the rules-of-the-road guard slice and makes the manifest declaration the guard-enforced source of package topology shape. The check stays lightweight: it validates file placement against declared units and does not add import-graph or export-graph analysis.

## Follow-Ups

- Use this guard as the baseline when conversion rows remove `sdl.remainder` from properly formed container packages.
- Per-package conversion slices still need their own topology shape evidence before/after `extract-graph.mjs` runs.
