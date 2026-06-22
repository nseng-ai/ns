import { withImmediateCommandAck } from "@sdl/pi-extension-runtime/command-ack";
import type { ExtensionAPI } from "./handoff/runtime-types.ts";
import { registerClaudeHandoffCommand } from "./claude/handoff-command.ts";
import { runInteractiveClaudeWithSpawnSync } from "./claude/interactive-spawn.ts";

export default function claudeExtension(pi: ExtensionAPI): void {
	const commandPi = withImmediateCommandAck(pi);
	registerClaudeHandoffCommand(commandPi, {
		runClaude: runInteractiveClaudeWithSpawnSync,
		env: process.env,
	});
}
