# Standalone Capability Packages Relocated

## Summary

The approved early mechanical relocation slice moved the standalone capability packages `@sdl/plans`, `@sdl/address`, and `@sdl/aretro` under `ts/packages/capabilities/` without changing package names, public import specifiers, manifests beyond path-sensitive scripts, command-loader package paths, or standalone status.

## Objective Impact

This completes the inventory review ruling that capability-tier standalone packages should live in the capability directory even when they are not containerized. Containers still relocate in their own conversion slices, so this update does not change the package conversion sequence beyond closing the early relocation row.

## Follow-Ups

- Continue with the next approved conversion row; do not use this relocation as permission to containerize standalone packages.
- Future path-sensitive package references should use the new `ts/packages/capabilities/{plans,address,aretro}` locations.
