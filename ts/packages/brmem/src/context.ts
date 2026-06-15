import { readStdin } from "@asdl/core/stdin";

import type { BrmemGateway } from "./gateway.ts";
import { RealGitSetupGateway, type GitSetupGateway } from "./git-setup-gateway.ts";
import { RealBrmemPromptResolver, type BrmemPromptResolver } from "./prompt-resolution.ts";
import { RealGitBrmemGateway } from "./real-git-gateway.ts";
import { NodeBrmemSourceReader, type BrmemSourceReader } from "./source-reader.ts";

export interface BrmemCliContext {
	gateway: BrmemGateway;
	gitSetupGateway: GitSetupGateway;
	promptResolver: BrmemPromptResolver;
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin: () => Promise<string>;
	sourceReader: BrmemSourceReader;
}

export function createRealBrmemContext(options: { cwd?: string | undefined; env?: NodeJS.ProcessEnv | undefined } = {}): BrmemCliContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	return {
		gateway: new RealGitBrmemGateway(cwd),
		gitSetupGateway: new RealGitSetupGateway(cwd),
		promptResolver: new RealBrmemPromptResolver({ env }),
		cwd,
		env,
		stdin: readStdin,
		sourceReader: new NodeBrmemSourceReader(),
	};
}
