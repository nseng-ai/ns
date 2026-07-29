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
		let startPoint: string;
		let startRef: string;
		if (request.basis.type === "current-head") {
			const head = await this.git.headCommit({ cwd: request.cwd, signal: request.signal });
			if (!head.ok) {
				return { ok: false, error: { ...head.error, branchCreated: false } };
			}
			startPoint = head.value;
			startRef = "HEAD";
		} else {
			startPoint = request.basis.startPoint;
			startRef = request.basis.startRef;
		}
		const created = await this.git.createBranchAtStartPoint({
			cwd: request.cwd,
			branch: request.branch,
			startPoint,
			signal: request.signal,
		});
		if (!created.ok) {
			return { ok: false, error: { ...created.error, branchCreated: false } };
		}
		return await verifyCreatedBranch(this.git, request, {
			startPoint,
			startRef,
			relationship: { type: "none" },
		});
	}
}
