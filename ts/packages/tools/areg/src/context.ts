import { resolveClinkrInteraction, type ClinkrInteraction } from "@nseng-ai/clinkr";
import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/capability-kit/git";
import { readStdinLine } from "@nseng-ai/foundation/cli-runtime";

import type {
	AregGithubGateway,
	AregGitGateway,
	AregProjectGateway,
	AregPromptGateway,
} from "./gateways.ts";
import {
	RealAregGithubGateway,
	RealAregProjectGateway,
	RealAregPromptGateway,
} from "./real-gateways.ts";

export interface AregCliContext {
	github: AregGithubGateway;
	project: AregProjectGateway;
	git: AregGitGateway;
	prompt: AregPromptGateway;
	interaction: ClinkrInteraction;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export function createRealAregContext(
	options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): AregCliContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const git = new RealGitGateway(new NodeCommandExecApi());
	return {
		github: new RealAregGithubGateway(),
		project: new RealAregProjectGateway({ git }),
		git,
		prompt: new RealAregPromptGateway(),
		interaction: resolveClinkrInteraction({
			stdin: readStdinLine,
			stderr: (text) => process.stderr.write(text),
		}),
		cwd,
		env,
	};
}
