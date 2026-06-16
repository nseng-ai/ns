# SDL Code Lifecycle Hard Cutover

## Summary

PR #1665 completed the first nested SDL code-lifecycle alias slice for the existing SDL commands: `/sdl:code:changes`, `/sdl:code:checkpoint`, and `/sdl:code:submit` now mirror `sdl changes`, `sdl cp`, and `sdl submit` while the flat `/sdl:changes`, `/sdl:cp`, and `/sdl:submit` mirrors remain primary.

The follow-up implementation completed the remaining Pi surface hard cutover: `/sdl:code:autobranch`, `/sdl:code:autoslot`, `/sdl:code:land`, `/sdl:code:push`, and `/sdl:code:regenerate-pr` replace the old `/code:autobranch`, `/code:autoslot`, `/code:land`, `/code:push`, and `/code:pr-regen` registrations. The remaining `/code:*` project surface is `/code:pr-feedback-watch`, which stays excluded from the SDL code-lifecycle family as review workflow.

## Objective Impact

The `/sdl:code:*` Pi taxonomy now exists for the full settled code-lifecycle family. Existing SDL commands continue to delegate through the SDL CLI bridge; hybrid lifecycle commands keep lower implementation ownership where appropriate: autobranch delegates to the CCC CLI bridge, autoslot and land delegate to CCC orchestration, push remains the guarded Pi git-push helper under the SDL code-lifecycle name, and PR regeneration exposes the SDL code-lifecycle name while the lower implementation still lives behind `asdl-dev pr-regen`.

The hard-cutover policy was applied: old `/code:*` lifecycle aliases are not registered. Tests assert the new `/sdl:code:*` registrations and absence of old `/code:*` surfaces; parity metadata, docs, and context now describe the SDL code-lifecycle surfaces.

## Follow-Ups

- Treat any remaining old `/code:*` lifecycle references as historical migration notes, absence assertions, or stale docs to prune when found.
- Decide in a later slice whether hybrid `/sdl:code:*` commands should gain flat `sdl <name>` CLI command entries or stay Pi-first wrappers over lower orchestration.
- Keep `pr-feedback-watch` outside `/sdl:code:*` until a separate review-workflow taxonomy decision is made.
