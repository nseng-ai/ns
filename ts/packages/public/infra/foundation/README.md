# @nseng-ai/foundation

Foundation provides ns-independent infrastructure through focused public subpaths such as `exec`, `git`, `time`, and `cli-runtime`.

## CLI runtime adapters

`@nseng-ai/foundation/cli-runtime` adapts Clinkr applications to standalone process execution. Its process-backed composition provides:

- deferred acquisition of one finite JSON request for `--input-json`;
- invocation-scoped structured-text and raw-byte output adapters;
- terminal rendering capabilities; and
- line input used only by standalone semantic interaction adapters.

These concerns remain separate. Finite JSON request input is not a general stdin abstraction and is not interactive input. Clinkr or the owning command retains JSON parsing, schema validation, source-conflict checks, and errors. Confirmation and selection remain semantic host operations rather than terminal-stream capabilities.

Standalone adapters may default to process streams and terminal facts. Embedded and test hosts override them with invocation-owned finite input, output sinks, and rendering capabilities; they must not inherit ambient process input/output or infer ANSI support from the physical terminal.
