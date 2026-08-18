import {
	formatExistingBranchContextReuse,
	resolveExistingBranchContextReuse,
	type BranchContextContext,
	type ExistingBranchContextReuse,
} from "@nseng-ai/branch-context/api";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import type { GitGateway } from "@nseng-ai/foundation/git";
import {
	formatBranchContextImplBranchFollowUpFlow,
	runBranchContextImplBranchLaunch,
	type BranchContextImplBranchContext,
	type BranchContextImplBranchLaunchResult,
} from "./session/impl-branch-launch.ts";

const DORMANT_REUSE_STATUS_KEY = "ns:git:impl-branch-from-plan";

export interface DormantGitExistingBranchContextReuseOptions {
	pi: CommandExecApi;
	cwd: string;
	context: BranchContextContext;
	checkoutGit: Pick<GitGateway, "checkout">;
	launchContext: BranchContextImplBranchContext;
	branchName?: string;
	sessionEntries?: readonly unknown[];
	dryRun: boolean;
}

export type DormantGitExistingBranchContextReuseResult =
	| { type: "dry-run"; reuse: ExistingBranchContextReuse; message: string }
	| {
			type: "launch";
			reuse: ExistingBranchContextReuse;
			launch: BranchContextImplBranchLaunchResult;
	  };

/** Private dormant host fallback retained for maintainers; production handlers never import it. */
export async function runDormantGitExistingBranchContextReuse(
	input: DormantGitExistingBranchContextReuseOptions,
): Promise<DormantGitExistingBranchContextReuseResult> {
	const reuse = await resolveExistingBranchContextReuse(
		input.pi,
		{
			...(input.branchName === undefined ? {} : { explicitBranch: input.branchName }),
			...(input.sessionEntries === undefined ? {} : { sessionEntries: input.sessionEntries }),
		},
		{ cwd: input.cwd, context: input.context },
	);
	if (input.dryRun) {
		return { type: "dry-run", reuse, message: formatDryRun(reuse) };
	}

	const launch = await runBranchContextImplBranchLaunch({
		git: input.checkoutGit,
		ctx: input.launchContext,
		statusKey: DORMANT_REUSE_STATUS_KEY,
		target: reuse,
	});
	return { type: "launch", reuse, launch };
}

function formatDryRun(reuse: ExistingBranchContextReuse): string {
	return `Dry run: no branch would be created, no plan would be attached, no checkout would happen, no new session would be started, and no implementation prompt would be sent.\n\n${formatExistingBranchContextReuse(reuse)}\n\nNew-session implementation flow:\n${formatBranchContextImplBranchFollowUpFlow(reuse.branch, reuse.key)}`;
}
