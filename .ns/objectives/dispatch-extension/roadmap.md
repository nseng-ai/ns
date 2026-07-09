# Roadmap

## Work

- [ ] Design the dispatch capability and target seam: command shapes
      (`ns dispatch plan|prompt`), the target-backend interface, package home
      and name, and the ccc-cores-as-backend boundary. Read
      `docs/conventions/consumer-gateways-and-command-shape.md` and
      `ts/AGENTS.md` before shaping the CLI.
- [ ] Local target: `ns dispatch plan|prompt --target cmux` over the
      `@nseng-ai/ccc` cmux cores; Pi `/ccc:workspace:dispatch-*` become thin
      bridges (keeping Pi-native latest-plan session resolution); wrapper
      skill(s); typed parity metadata. Includes the ccc bin repair-or-retire
      decision.
  - Evidence: existing dispatch workflows validated unchanged behind the new
    surface.
- [ ] Cloud-target infrastructure decision: evaluate Eve vs Vercel Sandbox +
      AI SDK `HarnessAgent` (Claude Code / Pi adapters) vs other composition;
      record the decision and rationale as a Semantic Update. Inputs:
      `docs/wayfinding/ns-cloud-capabilities/` (Eve capability map, jot pad).
- [ ] Cloud identity and secrets slice: the minimal credentials model for
      remote execution on the chosen infrastructure — repo access, push
      scope, model keys — designed before the executor runs real work.
- [ ] Cloud target implementation: `--target cloud` end-to-end — a dispatched
      plan executes remotely, pushes its branch, and lands a
      handoff/branch-memory record the dispatching side can pick up.

## Parked

_None._
