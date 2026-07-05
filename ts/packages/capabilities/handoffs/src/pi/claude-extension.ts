import type { ExtensionAPI } from "./runtime-types.ts";
import { registerClaudeHandoffCommand } from "./claude-command.ts";
import { runInteractiveClaudeWithSpawnSync } from "./interactive-spawn.ts";

export { claudeHandoffParity } from "./claude-command.ts";

export default function claudeExtension(pi: ExtensionAPI): void {
	registerClaudeHandoffCommand(pi, {
		runClaude: runInteractiveClaudeWithSpawnSync,
		env: process.env,
	});
}
