import { readStdin } from "@asdl/core/stdin";

import type { BrmemGateway } from "./gateway.ts";
import { RealGitBrmemGateway } from "./real-git-gateway.ts";

export interface BrmemCliContext {
	gateway: BrmemGateway;
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin: () => Promise<string>;
}

export function createRealBrmemContext(options: { cwd?: string | undefined } = {}): BrmemCliContext {
	const cwd = options.cwd ?? process.cwd();
	return {
		gateway: new RealGitBrmemGateway(cwd),
		cwd,
		env: process.env,
		stdin: readStdin,
	};
}
