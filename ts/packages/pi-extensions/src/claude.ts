import type { ExtensionAPI } from "./handoff/runtime-types.ts";
import { registerClaudeHandoffCommand } from "./claude/handoff-command.ts";
import { runInteractiveClaudeWithSpawnSync } from "./claude/interactive-spawn.ts";

export default function claudeExtension(pi: ExtensionAPI): void {
	registerClaudeHandoffCommand(pi, { runClaude: runInteractiveClaudeWithSpawnSync, env: process.env });
}
