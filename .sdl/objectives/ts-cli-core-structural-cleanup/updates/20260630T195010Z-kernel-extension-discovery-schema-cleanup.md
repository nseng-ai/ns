# Kernel Extension Discovery Schema Cleanup

## Summary

Completed the neutral `@sdl/kernel` extension-discovery cleanup slice:

- Replaced the reflective `MANIFEST_COMMAND_FIELDS` table and field-spec type with package-local Zod-backed manifest command field parsing.
- Preserved existing diagnostic codes/messages and command-name metadata while keeping the path/name interaction where `name` can be inferred from manifest `path`.
- Deduplicated directory-index discovery through a helper that preserves `index.ts` before `index.js` precedence.
- Added focused unit coverage for path-inferred command names, invalid `fullDescription`, and `index.ts`/`index.js` precedence.

## Objective Impact

Marked the `@sdl/kernel` row complete as neutral SDK/kernel structural cleanup. The change stays package-local and does not promote manifest parsing policy to core, SDK public API, or a capability package.

## Follow-Ups

None for this row. Future kernel manifest parsing changes should continue preserving the existing structured diagnostic surface unless a separate compatibility decision changes it explicitly.

## Validation

- `pnpm --dir ts --filter @sdl/kernel test -- extension-discovery` — passed.
- `just ts-format-check` — passed.
- `just ts-lint` — passed.
- `just ts-check` — passed.
