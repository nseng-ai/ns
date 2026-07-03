import { NodeCommandExecApi } from "@ji/core/exec";
import { RealGitGateway } from "@ji/capability-kit/git";
import { resolveClinkrInteraction, type ClinkrInteraction } from "@ji/clinkr";
import { readStdin, readStdinLine } from "@ji/core/cli-runtime";

import type { BrmemEnvOption } from "./env.ts";
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
	stderr: (text: string) => void;
	interaction: ClinkrInteraction;
}

export function createRealBrmemContext(
	options: { cwd?: string; env?: BrmemEnvOption } = {},
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
		stderr: (text) => process.stderr.write(text),
		interaction: resolveClinkrInteraction({
			stdin: readStdinLine,
			stderr: (text) => process.stderr.write(text),
		}),
	};
}
