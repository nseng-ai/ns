# Choose branch-retro CLI Name

## Summary

The skill-facing command path will use the standalone and plugin CLI name `branch-retro`, beginning with `branch-retro exec collect-evidence`. The Python package/workspace package remains `asdl-retro`.

## Objective Impact

This resolves the command-name open question and updates the durable plan to make PR 1 create an outer `branch-retro` group instead of `retro`. Later collector and skill work should target `branch-retro exec collect-evidence`.

## Follow-Ups

- Implement PR 1 with the `branch-retro` command/group name while keeping the package name `asdl-retro` unless a later decision changes it.
