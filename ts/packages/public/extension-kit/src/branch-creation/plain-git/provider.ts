import type {
	BranchCreationGitGateway,
	BranchCreationProvider,
	BranchCreationRequest,
	BranchCreationResult,
} from "../contract.ts";
import { verifyCreatedBranch } from "../verify-created-branch.ts";

export class PlainGitBranchCreationProvider implements BranchCreationProvider {
	readonly mode = "plain-git" as const;
	private readonly git: BranchCreationGitGateway;

	constructor(git: BranchCreationGitGateway) {
		this.git = git;
	}

	async createBranch(request: BranchCreationRequest): Promise<BranchCreationResult> {
		const created =
			request.basis.type === "current-head"
				? await this.git.createBranchAtHead({
						cwd: request.cwd,
						branch: request.branch,
						signal: request.signal,
					})
				: await this.git.createBranchAtStartPoint({
						cwd: request.cwd,
						branch: request.branch,
						startPoint: request.basis.startPoint,
						signal: request.signal,
					});
		if (!created.ok) {
			return { ok: false, error: { ...created.error, branchCreated: false } };
		}
		return await verifyCreatedBranch(this.git, request);
	}
}
