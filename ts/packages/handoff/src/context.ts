import { NodeCommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";
import { readStdin } from "@asdl/core/stdin";

import type { HandoffBrmemGateway } from "./brmem-gateway.ts";
import { RealBrmemCliGateway } from "./real-brmem-cli-gateway.ts";

export interface HandoffCliContext {
	cwd: string;
	env: NodeJS.ProcessEnv;
	git: GitGateway;
	brmem: HandoffBrmemGateway;
	stdin: () => Promise<string>;
	stderr: (text: string) => void;
}

export function createRealHandoffContext(options: { cwd?: string | undefined; env?: NodeJS.ProcessEnv | undefined } = {}): HandoffCliContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const execApi = new NodeCommandExecApi();
	return {
		cwd,
		env,
		git: new RealGitGateway(execApi),
		brmem: new RealBrmemCliGateway({ cwd, execApi }),
		stdin: readStdin,
		stderr: (text) => process.stderr.write(text),
	};
}
