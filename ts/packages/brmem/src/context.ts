import { readStdin } from "@asdl/core/stdin";

import type { BrmemGateway } from "./gateway.ts";
import { RealGitBrmemGateway } from "./real-git-gateway.ts";
import { NodeBrmemSourceReader, type BrmemSourceReader } from "./source-reader.ts";

export interface BrmemCliContext {
	gateway: BrmemGateway;
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin: () => Promise<string>;
	sourceReader: BrmemSourceReader;
}

export function createRealBrmemContext(options: { cwd?: string | undefined } = {}): BrmemCliContext {
	const cwd = options.cwd ?? process.cwd();
	return {
		gateway: new RealGitBrmemGateway(cwd),
		cwd,
		env: process.env,
		stdin: readStdin,
		sourceReader: new NodeBrmemSourceReader(),
	};
}
