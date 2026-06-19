import process from "node:process";

import { NodeCommandExecApi } from "@asdl/core/exec";

import { RealAretroGitGateway } from "./gateways/git-real.ts";
import type { AretroGitGateway } from "./gateways/git.ts";
import type { SessionSource } from "./sessions/source.ts";
import { PiJsonlSessionSource } from "./sessions/pi-jsonl-source.ts";

export interface AretroCliContext {
	cwd: string;
	env: NodeJS.ProcessEnv;
	git: AretroGitGateway;
	sessionSource: SessionSource;
}

export function createRealAretroContext(
	options: {
		cwd?: string | undefined;
		env?: NodeJS.ProcessEnv | undefined;
		git?: AretroGitGateway | undefined;
		sessionSource?: SessionSource | undefined;
	} = {},
): AretroCliContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const execApi = new NodeCommandExecApi();
	const git = options.git ?? new RealAretroGitGateway(execApi);
	const sessionSource = options.sessionSource ?? new PiJsonlSessionSource();
	return { cwd, env, git, sessionSource };
}
