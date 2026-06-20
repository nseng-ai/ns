# Handoff List Card Renderer

## Summary

Replaced the non-empty `/handoff:list` pipe-table notification with a custom Pi message renderer for handoff list cards. Current-branch lists now render slug, preview, and a copyable `/handoff:pickup <slug>` command. All-branch lists group cards by branch and render branch-qualified pickup commands while keeping normal output free of `.md` storage keys and Branch Memory locators.

Updated the engineered handoff extension, package tests, handoff docs, resource catalog, and portable `handoff-load` listing guidance to describe the card-style list output.

## Evidence

Pi RPC `get_commands` evidence reported the intended project extension commands present: `handoff:create`, `handoff:pickup`, and `handoff:list`. It reported `handoff:load`, `brmem-handoff`, and `brmem-pickup-handoff` absent.

## Validation

- `bun test ts/packages/pi-extensions/test/handoff.test.ts` passed.
- `just ts-check` passed.
- `just ts-test` passed.
- `just dprint-check` passed after `just dprint-fix` formatted Markdown tables.
- `git diff --check` passed.
