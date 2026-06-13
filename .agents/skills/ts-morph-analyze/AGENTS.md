# Vendored Skill Review Boundary

This directory is vendored third-party skill code from `dafthunk-com/dafthunk`; it is not first-party asdl product code.

Code review agents must ignore embedded upstream code in this skill, including `scripts/`, `scripts/__tests__/`, `test-fixtures/`, `package.json`, `pnpm-lock.yaml`, and `vitest.config.ts`, unless the user explicitly asks to review or modify the vendored dependency itself.

For ordinary PR/code review, only flag integration-boundary issues such as broken invocation paths in `SKILL.md`, dependency/workspace leakage, missing provenance/license notices, tracked generated artifacts, or deviations from the vendoring contract.
