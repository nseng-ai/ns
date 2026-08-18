import type {
	BranchCreationGitGateway,
	BranchCreationOutcome,
	BranchCreationProvider,
	BranchCreationRequest,
} from "./contract.ts";

export async function createBranchWithProvider(options: {
	git: BranchCreationGitGateway;
	provider: BranchCreationProvider;
	request: BranchCreationRequest;
}): Promise<BranchCreationOutcome> {
	const before = await options.git.localBranchPresence({
		cwd: options.request.cwd,
		branch: options.request.targetBranch,
		signal: options.request.signal,
	});
	if (before.type === "error") {
		return failure(options, "collision", false, before.error);
	}
	if (before.type === "present") {
		return failure(options, "collision", true, {
			code: "branch-already-exists",
			message: [
				"Target branch already exists; refusing to overwrite.",
				`Branch: ${options.request.targetBranch}`,
				`Ref: ${before.refName}`,
				`Command: ${before.displayCommand}`,
			].join("\n"),
			displayCommand: before.displayCommand,
		});
	}

	const providerResult = await options.provider.createBranch(options.request);
	const after = await options.git.localBranchPresence({
		cwd: options.request.cwd,
		branch: options.request.targetBranch,
		signal: options.request.signal,
	});
	if (after.type === "error") {
		return failure(
			options,
			"postcondition",
			providerResult.ok || providerResult.branchCreated,
			after.error,
		);
	}
	const branchObserved = after.type === "present";
	if (!providerResult.ok) {
		return failure(options, "provider", branchObserved, providerResult.error);
	}
	if (!branchObserved) {
		return failure(options, "postcondition", false, {
			code: "branch-create-postcondition-failed",
			message: `Branch creation provider reported success, but Git does not contain refs/heads/${options.request.targetBranch}.`,
		});
	}
	const tips = await options.git.listLocalBranchTips({
		cwd: options.request.cwd,
		signal: options.request.signal,
	});
	if (!tips.ok) return failure(options, "postcondition", true, tips.error);
	const targetTip = tips.value.find((tip) => tip.name === options.request.targetBranch)?.headSha;
	if (targetTip !== options.request.startPoint) {
		return failure(options, "postcondition", true, {
			code: "branch-create-wrong-start",
			message: `Branch creation provider created refs/heads/${options.request.targetBranch} at ${targetTip ?? "an unreadable commit"}, not the requested start ${options.request.startPoint}.`,
		});
	}
	return {
		type: "created",
		providerId: options.provider.id,
		targetBranch: options.request.targetBranch,
		startPoint: options.request.startPoint,
		refName: after.refName,
	};
}

function failure(
	options: { provider: BranchCreationProvider; request: BranchCreationRequest },
	stage: "collision" | "provider" | "postcondition",
	branchObserved: boolean,
	error: { code: string; message: string; displayCommand?: string },
): BranchCreationOutcome {
	return {
		type: "failed",
		providerId: options.provider.id,
		targetBranch: options.request.targetBranch,
		startPoint: options.request.startPoint,
		stage,
		branchObserved,
		error,
	};
}
