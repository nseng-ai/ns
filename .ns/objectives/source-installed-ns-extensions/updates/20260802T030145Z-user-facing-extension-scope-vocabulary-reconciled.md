# User-facing extension scope vocabulary reconciled

## Summary

Canonical ns and SDK documentation now consistently names the two lifecycle effects as **user-scoped command availability** and **project-scoped activation**. The labels distinguish machine-wide command access from repository contribution reconciliation without introducing extension types or lifecycle states.

The ns package README, SDK README, extension-author guide, and SDK reference now agree on the complete contract: project scope is the default; user scope is command-only; user configuration and managed npm bytes use their XDG config and data roots; local packages are used in place through absolute declarations; moved checkouts are reported and recovered through uninstall/reinstall; floating and pinned npm updates differ; user lifecycle operations do not activate repository artifacts; same-package project declarations replace user declarations atomically; different-package command collisions follow project-over-user precedence; same-scope collisions fail; built-in paths remain reserved; and `just install-ns` installs only the source CLI shim.

The SDK glossary records the two canonical labels and their avoid lists so later documentation does not drift toward “global extension,” “user activation,” or a synthetic installed/activated state model.

## Objective Impact

The final roadmap row, “Reconcile user-facing extension documentation and configuration vocabulary,” is complete. All semantic roadmap work for `source-installed-ns-extensions` is now complete, and the Objective is ready for the explicit close workflow.

Validation evidence:

- `just dprint-check` passed after the documentation edits.
- `git diff --check` passed.
- The full `just` entrypoint passed, including dprint, dependency checks, TypeScript formatting, lint, typecheck, 168 TypeScript style-guard tests, 6,070 default tests, and the repository-wide Objective edge sweep.

## Follow-Ups

- Run the explicit Objective close workflow for `source-installed-ns-extensions`; no semantic roadmap work remains.
