# Choose branch-retro CLI Name

## Summary

The skill-facing command path will use the standalone and plugin CLI name `aretro`, beginning with `aretro exec collect-evidence`. The Python package/workspace package remains `aretro`.

## Objective Impact

This resolves the command-name open question and updates the durable plan to make PR 1 create an outer `aretro` group instead of `retro`. Later collector and skill work should target `aretro exec collect-evidence`.

## Follow-Ups

- Implement PR 1 with the `aretro` command/group name while keeping the package name `aretro` unless a later decision changes it.
