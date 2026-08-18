import {
	formatExistingBranchContextReuse,
	resolveExistingBranchContextReuse,
	type BranchContextContext,
	type ExistingBranchContextReuse,
} from "@nseng-ai/branch-context/api";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import type { GitGateway } from "@nseng-ai/foundation/git";
import {
	formatBranchContextGtUpstackImplFollowUpFlow,
	runBranchContextGtUpstackImplLaunch,
	type BranchContextGtUpstackImplContext,
	type BranchContextGtUpstackImplLaunchResult,
} from "./gt/upstack-impl-launch.ts";

const DORMANT_REUSE_STATUS_KEY = "ns:gt:impl-branch-from-plan";

export interface DormantGtExistingBranchContextReuseOptions {
	pi: CommandExecApi;
	cwd: string;
	context: BranchContextContext;
	checkoutGit: Pick<GitGateway, "checkout">;
	launchContext: BranchContextGtUpstackImplContext;
	branchName?: string;
	sessionEntries?: readonly unknown[];
	dryRun: boolean;
}

export type DormantGtExistingBranchContextReuseResult =
	| { type: "dry-run"; reuse: ExistingBranchContextReuse; message: string }
	| {
			type: "launch";
			reuse: ExistingBranchContextReuse;
			launch: BranchContextGtUpstackImplLaunchResult;
	  };

/** Private dormant host fallback retained for maintainers; production handlers never import it. */
export async function runDormantGtExistingBranchContextReuse(
	input: DormantGtExistingBranchContextReuseOptions,
): Promise<DormantGtExistingBranchContextReuseResult> {
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

	const launch = await runBranchContextGtUpstackImplLaunch({
		git: input.checkoutGit,
		ctx: input.launchContext,
		statusKey: DORMANT_REUSE_STATUS_KEY,
		target: reuse,
	});
	return { type: "launch", reuse, launch };
}

function formatDryRun(reuse: ExistingBranchContextReuse): string {
	return `Dry run: no branch would be created, no plan would be attached, no checkout would happen, no new session would be started, and no implementation prompt would be sent.\n\n${formatExistingBranchContextReuse(reuse)}\n\nProvider action: provider skipped\n\nNew-session implementation flow:\n${formatBranchContextGtUpstackImplFollowUpFlow(reuse.branch, reuse.key)}`;
}
