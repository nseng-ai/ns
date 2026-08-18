import {
	formatExistingBranchContextReuse,
	formatImplBranchContextCommand,
	resolveExistingBranchContextReuse,
	type BranchContextContext,
	type ExistingBranchContextReuse,
} from "@nseng-ai/branch-context/api";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { CommandContext } from "./host-types.ts";
import {
	runGsImplementationLaunch,
	type GsImplementationLaunchResult,
} from "./implementation-launch.ts";
import type { GsPiCommandApi } from "./pi-command-api.ts";

export interface DormantGsExistingBranchContextReuseOptions {
	pi: GsPiCommandApi;
	cwd: string;
	context: BranchContextContext;
	checkoutGit: Pick<GitGateway, "checkout">;
	launchContext: CommandContext;
	branchName?: string;
	sessionEntries?: readonly unknown[];
	dryRun: boolean;
}

export type DormantGsExistingBranchContextReuseResult =
	| { type: "dry-run"; reuse: ExistingBranchContextReuse; message: string }
	| {
			type: "launch";
			reuse: ExistingBranchContextReuse;
			launch: GsImplementationLaunchResult;
	  };

/** Private dormant host fallback retained for maintainers; production handlers never import it. */
export async function runDormantGsExistingBranchContextReuse(
	input: DormantGsExistingBranchContextReuseOptions,
): Promise<DormantGsExistingBranchContextReuseResult> {
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

	const launch = await runGsImplementationLaunch({
		pi: input.pi,
		ctx: input.launchContext,
		git: input.checkoutGit,
		branch: reuse.branch,
		key: reuse.key,
		attachment: "reused",
	});
	return { type: "launch", reuse, launch };
}

function formatDryRun(reuse: ExistingBranchContextReuse): string {
	return [
		"Dry run: no GS, Git, Branch Memory, checkout, or session mutation occurred.",
		formatExistingBranchContextReuse(reuse),
		"Topology action: provider skipped",
		`Target branch: ${reuse.branch}`,
		`Key: ${reuse.key}`,
		"Follow-up flow:",
		`git checkout ${reuse.branch}`,
		"/new (with parent-session evidence)",
		formatImplBranchContextCommand(reuse.key),
	].join("\n");
}
