import { RealGitBrmemReadGateway } from "@nseng-ai/brmem";
import { piExecApiToCommandExecApi, type CommandExecApi } from "@nseng-ai/foundation/command";
import { RealGitGateway, type GitGateway } from "@nseng-ai/capability-kit/git";
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

export function createPiHandoffContext(pi: ExtensionAPI): PiHandoffContext {
	const commands = piExecApiToCommandExecApi(pi);
	return { commands, git: new RealGitGateway(commands) };
}

export function createPiHandoffGitGateway(pi: ExtensionAPI): GitGateway {
	return createPiHandoffContext(pi).git;
}

export function createPiHandoffStorageDeps(pi: ExtensionAPI, cwd: string): HandoffReadStorageDeps {
	return createPiHandoffStorageDepsFromContext(createPiHandoffContext(pi), cwd);
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
