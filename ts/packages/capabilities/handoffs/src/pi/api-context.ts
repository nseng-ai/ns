import { RealGitBrmemReadGateway } from "@nseng-ai/brmem";
import { piExecApiToCommandExecApi, type CommandExecApi } from "@nseng-ai/foundation/command";
import { RealGitGateway, type GitGateway } from "@nseng-ai/capability-kit/git";
import type { HandoffReadStorageDeps } from "../api/index.ts";

import type { ExtensionAPI } from "./runtime-types.ts";

export interface PiHandoffContext {
	commands: CommandExecApi;
	git: GitGateway;
}

export function createPiHandoffContext(pi: ExtensionAPI): PiHandoffContext {
	const commands = piExecApiToCommandExecApi(pi);
	return { commands, git: new RealGitGateway(commands) };
}

export function createPiHandoffGitGateway(pi: ExtensionAPI): GitGateway {
	return createPiHandoffContext(pi).git;
}

export function createPiHandoffStorageDeps(pi: ExtensionAPI, cwd: string): HandoffReadStorageDeps {
	const context = createPiHandoffContext(pi);
	return {
		brmem: new RealGitBrmemReadGateway({ cwd, commands: context.commands, git: context.git }),
		git: context.git,
		cwd,
	};
}
