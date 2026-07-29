import type {
	BranchCreationGitGateway,
	BranchCreationRequest,
	BranchCreationResult,
} from "./contract.ts";

export async function verifyCreatedBranch(
	git: BranchCreationGitGateway,
	request: BranchCreationRequest,
): Promise<BranchCreationResult> {
	const presence = await git.localBranchPresence({
		cwd: request.cwd,
		branch: request.branch,
		signal: request.signal,
	});
	if (presence.type === "present") return { ok: true };
	if (presence.type === "error") {
		return { ok: false, error: { ...presence.error, branchCreated: true } };
	}
	return {
		ok: false,
		error: {
			code: "branch-postcondition-failed",
			branchCreated: true,
			message: `Branch creation did not produce observable local ref ${presence.refName}.`,
		},
	};
}
