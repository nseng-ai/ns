# OpenClaw's MCP-to-CLI tool

## Conclusion

Yes. The tool is **MCPorter** (`mcporter`), in the official `openclaw/mcporter` repository. Peter Steinberger is the person associated with both projects: OpenClaw's official README says OpenClaw was built by Peter Steinberger and the community, while MCPorter's initial commit is his and GitHub lists `steipete` as its leading contributor. This supports calling him MCPorter's original/primary author, while recognizing that both are community projects.

Sources:

- OpenClaw README: <https://github.com/openclaw/openclaw#molty>
- MCPorter repository: <https://github.com/openclaw/mcporter>
- MCPorter initial commit by Peter Steinberger: <https://github.com/openclaw/mcporter/commit/92ba90e29d0b175b0b453b66fdfac2589ca875bd>
- MCPorter contributors: <https://github.com/openclaw/mcporter/graphs/contributors>

## What it actually does

MCPorter has **two distinct CLI behaviors**:

1. The `mcporter` CLI dynamically discovers configured or ad-hoc MCP servers, lists their current tools, and invokes a tool with commands such as `mcporter list <server>` and `mcporter call <server.tool>`. This is runtime exposure, not code generation.
2. `mcporter generate-cli` introspects one MCP server's tool schemas and writes a **persistent, schema-aware CLI artifact**. Each MCP tool becomes a subcommand. The default artifact is a TypeScript file with the resolved server definition and schemas embedded; optional modes produce a bundled JavaScript file or a Bun-compiled executable. The generated CLI still connects to and calls the MCP server at runtime—it does not translate the server implementation into local code.

Thus, the precise answer is stronger than “dynamically wraps MCP as a CLI”: MCPorter can do that dynamically, but it also genuinely generates reusable CLI source/artifacts.

Sources:

- README capabilities and quick start: <https://github.com/openclaw/mcporter#key-capabilities>
- Standalone generation guide: <https://github.com/openclaw/mcporter#generate-a-standalone-cli>
- Generator design/status: <https://github.com/openclaw/mcporter/blob/main/docs/cli-generator.md>
- Command reference: <https://github.com/openclaw/mcporter/blob/main/docs/cli-reference.md#mcporter-generate-cli>

## Installation and basic usage

Try it without installing:

```bash
npx mcporter list
npx mcporter call linear.create_comment issueId:ENG-123 body:'Looks good!'
```

Install globally with npm or Homebrew:

```bash
npm install -g mcporter
# or
brew tap steipete/tap
brew install steipete/tap/mcporter
```

Generate a CLI from an HTTP or stdio MCP server:

```bash
npx mcporter generate-cli https://mcp.context7.com/mcp
npx mcporter generate-cli "npx -y chrome-devtools-mcp@latest"
```

By default this emits `<server>.ts`. Useful variants include:

```bash
npx mcporter generate-cli linear --bundle dist/linear.js
npx mcporter generate-cli linear --include-tools issues_list,issues_create
npx mcporter generate-cli --command https://mcp.context7.com/mcp --runtime bun --compile
```

Sources:

- README quick start/install/generation: <https://github.com/openclaw/mcporter#quick-start>, <https://github.com/openclaw/mcporter#installation>, <https://github.com/openclaw/mcporter#generate-a-standalone-cli>
- Full generator flags: <https://github.com/openclaw/mcporter/blob/main/docs/cli-reference.md#mcporter-generate-cli>

## Caveats

- **Generation takes a snapshot.** The generated CLI embeds the resolved server definition and discovered tool schemas. It has no runtime `--config` or `--server` override; regenerate after server schema/config changes. Embedded metadata supports `mcporter inspect-cli` and `mcporter generate-cli --from <artifact>`.
- **“Standalone” has levels.** The default output is TypeScript and imports `mcporter` and `commander`; use `--bundle` for a single JavaScript artifact. A self-contained compiled executable requires Bun and `--compile`.
- **The server remains required.** Generated commands are clients: HTTP endpoints must remain reachable, and stdio server commands/dependencies must still be runnable. Authentication and secrets are runtime concerns; OAuth servers may require a prior `mcporter auth` flow or headless token setup.
- **Generation is one server at a time.** Tool filtering is available, but `--include-tools` and `--exclude-tools` are mutually exclusive; requesting missing included tools fails, and excluding every tool fails.
- **Runtime/toolchain requirements matter.** The npm package currently declares Node `>=24`; Bun is additionally required for Bun bundling/compilation.
- **Treat embedded configuration carefully.** The generated artifact embeds the resolved server definition. Keep secrets in environment placeholders/private configuration rather than literal headers or environment values before sharing an artifact.

Sources:

- Generator snapshot, runtime, bundling, and regeneration details: <https://github.com/openclaw/mcporter/blob/main/docs/cli-generator.md>
- Generator flags and filtering behavior: <https://github.com/openclaw/mcporter/blob/main/docs/cli-reference.md#mcporter-generate-cli>
- Authentication guidance: <https://github.com/openclaw/mcporter#oauth-protected-servers>
- Package runtime requirement: <https://github.com/openclaw/mcporter/blob/main/package.json>
