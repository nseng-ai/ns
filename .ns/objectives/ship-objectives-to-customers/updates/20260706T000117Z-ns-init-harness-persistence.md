# Update: `ns init` harness persistence and host wiring landed

Implemented the bundle-independent `ns init` activation slice.

## Delivered

- Added top-level `ns init` command modules in `@nseng-ai/ns-init` and preinstalled catalog wiring into the `@nseng-ai/ns` host.
- Added `ns.toml` config support for top-level `harnesses = [...]`:
  - first run without `--harness` fails with usage guidance;
  - explicit `--harness` writes/replaces persisted harnesses;
  - rerun without `--harness` uses persisted harnesses;
  - invalid TOML/invalid harnesses fail structurally.
- Kept activation behavior behind gateway seams: git/trunk verification, managed `AGENTS.md` block, `CLAUDE.md -> @AGENTS.md`, `.ns/objectives/.gitkeep`, and pending-bundle `SkillMaterializer` stub.
- Left real skill copying deferred to the bundle + `skill-management-subsystem` slice.

## Evidence

- `pnpm --dir ts --filter @nseng-ai/ns-init test`
- `pnpm --dir ts --filter @nseng-ai/ns test`
- `pnpm --dir ts --filter @nseng-ai/ns-init check`
- `pnpm --dir ts --filter @nseng-ai/ns check`
- `just ts-format-check`
- `just ts-lint`

## Roadmap impact

Marked the `@nseng-ai/ns-init` scaffold row complete and the bundle-independent `ns init` behavior row complete. Remaining customer-shipment work is still gated on checkout-free publish verification, skill installation/materialization, docs, and all-harness end-to-end verification.
