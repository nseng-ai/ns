import { resolveClinkrInteraction, type ClinkrInteraction } from "@nseng-ai/clinkr";
import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/capability-kit/git";
import { readStdinLine } from "@nseng-ai/foundation/cli-runtime";

import type { AregGitGateway, AregProjectGateway } from "./gateways.ts";
import { RealAregProjectGateway } from "./gateways/project-gateway.ts";

export interface AregCliContext {
	project: AregProjectGateway;
	git: AregGitGateway;
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
		project: new RealAregProjectGateway({ git }),
		git,
		interaction: resolveClinkrInteraction({
			stdin: readStdinLine,
			stderr: (text) => process.stderr.write(text),
		}),
		cwd,
		env,
	};
}
