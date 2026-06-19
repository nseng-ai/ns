import process from "node:process";

import { NodeCommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";
import type { SessionSource } from "./sessions/source.ts";
import { PiJsonlSessionSource } from "./sessions/pi-jsonl-source.ts";

export interface AretroCliContext {
	cwd: string;
	env: NodeJS.ProcessEnv;
	git: GitGateway;
	sessionSource: SessionSource;
}

export function createRealAretroContext(
	options: {
		cwd?: string | undefined;
		env?: NodeJS.ProcessEnv | undefined;
		git?: GitGateway | undefined;
		sessionSource?: SessionSource | undefined;
	} = {},
): AretroCliContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const git = options.git ?? new RealGitGateway(new NodeCommandExecApi());
	const sessionSource = options.sessionSource ?? new PiJsonlSessionSource();
	return { cwd, env, git, sessionSource };
}
