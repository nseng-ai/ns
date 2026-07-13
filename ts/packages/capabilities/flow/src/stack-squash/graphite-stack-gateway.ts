import {
	RealGraphiteStackGateway,
	type GraphiteStackGateway,
	type GraphiteStackGitGateway,
} from "@nseng-ai/capability-kit/graphite/stack";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";

export type FlowGraphiteStackGitGateway = Pick<GitGateway, "currentBranch" | "gitCommonDir">;

export interface CreateFlowGraphiteStackGatewayOptions {
	execApi: CommandExecApi;
	env: NodeJS.ProcessEnv;
}

export function createFlowGraphiteStackGateway(
	options: CreateFlowGraphiteStackGatewayOptions,
): GraphiteStackGateway {
	const git = new RealGitGateway(options.execApi);
	return new RealGraphiteStackGateway({
		env: options.env,
		execApi: options.execApi,
		git: createFlowGraphiteStackGitGateway(git),
	});
}

export function createFlowGraphiteStackGitGateway(
	git: FlowGraphiteStackGitGateway,
): GraphiteStackGitGateway {
	return {
		async getGitCommonDir(cwd: string): Promise<string | null> {
			const result = await git.gitCommonDir({ cwd });
			return result.ok ? result.value : null;
		},
		async getCurrentBranch(cwd: string) {
			const result = await git.currentBranch({ cwd });
			if (result.type === "branch") return result;
			if (result.type === "detached") return result;
			return { type: "failure", failure: { message: result.error.message } };
		},
	};
}
