import { NodeCommandExecApi } from "@sdl/core/exec";
import { RealGitGateway } from "@sdl/core/git";
import { readStdin } from "@sdl/core/stdin";

import type { BrmemGateway } from "./gateway.ts";
import { RealBrmemPromptResolver, type BrmemPromptResolver } from "./prompt-resolution.ts";
import { RealGitBrmemGateway } from "./real-git-gateway.ts";
import { NodeBrmemSourceReader, type BrmemSourceReader } from "./source-reader.ts";

export interface BrmemCliContext {
	gateway: BrmemGateway;
	promptResolver: BrmemPromptResolver;
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin: () => Promise<string>;
	sourceReader: BrmemSourceReader;
}

export function createRealBrmemContext(
	options: { cwd?: string | undefined; env?: NodeJS.ProcessEnv | undefined } = {},
): BrmemCliContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const commands = new NodeCommandExecApi();
	const git = new RealGitGateway(commands);
	return {
		gateway: new RealGitBrmemGateway({ cwd, commands, git }),
		promptResolver: new RealBrmemPromptResolver({ env }),
		cwd,
		env,
		stdin: readStdin,
		sourceReader: new NodeBrmemSourceReader(),
	};
}
