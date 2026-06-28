# Update: `sdl address exec` cutover and standalone CLI removal

## Summary

Added the Address SDL extension command face and cut active repo consumers from the standalone `pr-address` binary to `sdl address exec ...`.

## Changes / Evidence

- Added `.sdl/extensions/address/package.json` plus one `exec-*` command module per retained operation, mounted by SDL as `sdl address exec <operation>`.
- Added package-owned SDL command adapter glue in `ts/packages/address/src/sdl-command.ts`; extension modules stay thin and reuse the existing Address operation handlers rather than shelling out to `pr-address`.
- Removed `bin.pr-address` from `@sdl/address` and removed `just install-pr-address` from the root `justfile`; `just install-tools` now installs `sdl` as the command face.
- Removed standalone `pr-address` CLI runtime scenario tests; retained operation tests now cover Address handlers directly and the SDL extension command can publish JSON schema.
- Cut Pi PR download/watch and local PR preview shell-outs to `sdl address exec ...`.
- Updated the public `skills/pr-address` content to instruct `sdl address exec ...` while retaining the skill directory/name for discoverability.

## Validation

Passed in this working session:

- `pnpm --dir ts run check`
- `pnpm --dir ts --filter @sdl/address run test` (10 files / 59 tests)
- `pnpm --dir ts --filter @sdl/pi run test` (45 files / 529 tests)
- `pnpm --dir ts --filter @local-pi-tools/pr-previews run test` (4 files / 29 tests)
- `node ts/packages/sdl/src/cli.ts address exec map-branch-prs --json-schema`
- `node ts/packages/sdl/src/cli.ts address exec map-branch-prs --branches-json '{"branches":["main"]}' --format json` (negative envelope for no open PR)
