import { RealGitBrmemReadGateway } from "@sdl/brmem";
import { piExecApiToCommandExecApi } from "@sdl/core/command";
import { RealGitGateway } from "@sdl/capability-kit/git";
import type { HandoffReadStorageDeps } from "../api/index.ts";

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
