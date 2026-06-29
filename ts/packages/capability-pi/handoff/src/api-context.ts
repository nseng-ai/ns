import { RealGitBrmemReadGateway } from "@sdl/brmem";
import { piExecApiToCommandExecApi } from "@sdl/exec";
import { RealGitGateway } from "@sdl/git";
import type { HandoffReadStorageDeps } from "@sdl/handoff/api";

import type { ExtensionAPI } from "./runtime-types.ts";

export function createPiHandoffStorageDeps(pi: ExtensionAPI, cwd: string): HandoffReadStorageDeps {
	const commands = piExecApiToCommandExecApi(pi);
	const git = new RealGitGateway(commands);
	return {
		brmem: new RealGitBrmemReadGateway({ cwd, commands, git }),
		git,
		cwd,
	};
}
