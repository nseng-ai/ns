import { RealGitBrmemReadGateway } from "@nseng-ai/brmem";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";
import type { HandoffReadStorageDeps } from "../api/index.ts";

import type { CommandContext, ExtensionAPI } from "./runtime-types.ts";

export interface PiHandoffContext {
	commands: CommandExecApi;
	git: GitGateway;
}

export interface HandoffCommandInvocation {
	pi: ExtensionAPI;
	rawArgs: string;
	ctx: CommandContext;
	handoffContext: PiHandoffContext;
}

export function createPiHandoffContext(commands: CommandExecApi): PiHandoffContext {
	return { commands, git: new RealGitGateway(commands) };
}

export function createPiHandoffGitGateway(commands: CommandExecApi): GitGateway {
	return createPiHandoffContext(commands).git;
}

export function createPiHandoffStorageDeps(
	commands: CommandExecApi,
	cwd: string,
): HandoffReadStorageDeps {
	return createPiHandoffStorageDepsFromContext(createPiHandoffContext(commands), cwd);
}

export function createPiHandoffStorageDepsFromContext(
	context: PiHandoffContext,
	cwd: string,
): HandoffReadStorageDeps {
	return {
		brmem: new RealGitBrmemReadGateway({ cwd, commands: context.commands, git: context.git }),
		git: context.git,
		cwd,
	};
}
