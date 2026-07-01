import type { ExplicitUndefined } from "@sdl/core/primitives";
import { NodeCommandExecApi } from "@sdl/exec";
import { RealGitGateway } from "@sdl/git";
import { resolveClinkrInteraction, type ClinkrInteraction } from "@sdl/clinkr";
import { readStdin, readStdinLine } from "@sdl/cli-runtime";

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
	interaction: ClinkrInteraction;
}

export function createRealBrmemContext(
	options: { cwd?: string; env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv> } = {},
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
		interaction: resolveClinkrInteraction({
			stdin: readStdinLine,
			stderr: (text) => process.stderr.write(text),
		}),
	};
}
