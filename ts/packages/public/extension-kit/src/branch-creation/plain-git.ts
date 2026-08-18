import type { GitGateway } from "@nseng-ai/foundation/git";

import type {
	BranchCreationProvider,
	BranchCreationProviderResult,
	BranchCreationRequest,
} from "./contract.ts";

export type PlainGitBranchCreationGateway = Pick<
	GitGateway,
	"createBranchAtHead" | "createBranchAtStartPoint"
>;

export class PlainGitBranchCreationProvider implements BranchCreationProvider<"plain-git"> {
	readonly id = "plain-git" as const;
	private readonly git: PlainGitBranchCreationGateway;

	constructor(git: PlainGitBranchCreationGateway) {
		this.git = git;
	}

	async createBranch(request: BranchCreationRequest): Promise<BranchCreationProviderResult> {
		const result =
			request.startPoint === "HEAD"
				? await this.git.createBranchAtHead({
						cwd: request.cwd,
						branch: request.targetBranch,
						signal: request.signal,
					})
				: await this.git.createBranchAtStartPoint({
						cwd: request.cwd,
						branch: request.targetBranch,
						startPoint: request.startPoint,
						signal: request.signal,
					});
		if (result.ok) return result;
		return { ok: false, error: result.error, branchCreated: false };
	}
}
