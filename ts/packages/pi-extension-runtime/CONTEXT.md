# @asdl/pi-extension-runtime

`@asdl/pi-extension-runtime` is the private neutral TypeScript helper layer for Pi extension runtime contracts and presentation utilities that are shared by CCC and repo-local Pi extension implementations. It is lower than CCC and lower than command orchestration packages: it exposes typed helper functions, parsers, and narrow runtime shapes; it does not register commands or own workflow policy.

## Language

**Pi extension runtime helper**:
A small TypeScript helper owned below orchestration packages for command execution presentation, machine-envelope parsing, terminal text shaping, skill block expansion, Objective picker/selection behavior, branch-slug normalization, and cmux/Pi command runtime types.
_Avoid_: command implementation, workflow owner, CCC orchestration, public npm API.

**Neutral runtime contract**:
A type or helper that can be consumed by both CCC and repo-local Pi extensions without creating an import cycle or implying command ownership.
_Avoid_: compatibility shim, adapter, domain lifecycle, public API promise.

**Runtime cmux helper path**:
A neutral helper module path under `@asdl/pi-extension-runtime/cmux/*` for cmux/Pi runtime types, primitive parsing, and launch-command formatting shared below CCC and repo-local Pi extensions. These paths describe the cmux runtime domain, not a `/cmux:*` Pi command namespace.
_Avoid_: command implementation, compatibility shim, new dependency direction, permanent workflow ownership statement.

**Machine envelope parser**:
The shared JSON envelope parser for command outputs with `exit_code` and object `data`, returning typed parse results and bounded diagnostic text for malformed output.
_Avoid_: CLI command, transport protocol, exception boundary.

**Command presentation helper**:
The shared formatter for command displays, shell quoting, stdout/stderr tails, and normalized exec results used in Pi extension-facing diagnostics.
_Avoid_: shell executor, gateway, subprocess policy.

**Objective selection helper**:
The neutral active-Objective selection pipeline shared by Objective extension commands and CCC stack implementation orchestration: load `objective list --format json`, inspect Objective path changes versus trunk and checkout state, present changed-first picker choices, and return one explicit Objective selector or no selection. It does not register slash commands or own Objective storage/update semantics.
_Avoid_: Objective CLI owner, CCC workflow owner, prompt dispatch, hidden branch-derived Objective inference.
