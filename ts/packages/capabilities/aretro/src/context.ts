import process from "node:process";

import { NodeCommandExecApi } from "@nseng-ai/core/exec";
import { RealGitGateway } from "@nseng-ai/capability-kit/git";
import type { GitGateway } from "@nseng-ai/capability-kit/git";
import type { SessionSource } from "./sessions/source.ts";
import { PiJsonlSessionSource } from "./sessions/pi-jsonl-source.ts";
import type { ExplicitUndefined } from "@nseng-ai/core/primitives";

export interface AretroCliContext {
	cwd: string;
	env: NodeJS.ProcessEnv;
	git: GitGateway;
	sessionSource: SessionSource;
}

export function createRealAretroContext(
	options: {
		cwd?: string;
		env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
		git?: GitGateway;
		sessionSource?: SessionSource;
	} = {},
): AretroCliContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const git = options.git ?? new RealGitGateway(new NodeCommandExecApi());
	const sessionSource = options.sessionSource ?? new PiJsonlSessionSource();
	return { cwd, env, git, sessionSource };
}
