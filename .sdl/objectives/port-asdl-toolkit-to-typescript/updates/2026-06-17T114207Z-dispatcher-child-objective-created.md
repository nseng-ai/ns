# Dispatcher child Objective created

Selected the default next capability, `asdl-dispatcher` / `dispatcher`, for the TypeScript migration and created the active child Objective `.asdl/objectives/dispatcher-typescript-port/`.

The initial contract inventory found a minimal placeholder surface:

- standalone `dispatcher` CLI help and version behavior;
- `asdl.plugins` entry point mounting under a parent command;
- `ClinkrGroup(name="dispatcher", help="Dispatch coding tasks to GitHub Actions.", operations=[])`;
- empty `DispatcherCliContext` with no gateways or state;
- no active callers beyond package scenario tests and workspace/build wiring.

The parent migration ledger now marks dispatcher as an active child-objective planning slice rather than unstarted. The child Objective preserves the next decision: either port the placeholder to TypeScript if consumers need the command/plugin discoverability, or deliberately retire the Python placeholder if no durable user-facing behavior needs preservation.
