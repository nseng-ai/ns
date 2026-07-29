import type { GraphiteBranchGateway } from "../../graphite/branch.ts";
import type {
	BranchCreationGitGateway,
	BranchCreationProvider,
	BranchCreationRequest,
	BranchCreationResult,
} from "../contract.ts";
import { PlainGitBranchCreationProvider } from "../plain-git/provider.ts";

export class GraphiteBranchCreationProvider implements BranchCreationProvider {
	readonly mode = "graphite" as const;
	private readonly git: BranchCreationGitGateway;
	private readonly graphite: GraphiteBranchGateway;

	constructor(options: { git: BranchCreationGitGateway; graphite: GraphiteBranchGateway }) {
		this.git = options.git;
		this.graphite = options.graphite;
	}

	async createBranch(request: BranchCreationRequest): Promise<BranchCreationResult> {
		const parent =
			request.basis.type === "current-head"
				? await resolveCurrentParent(this.git, request)
				: request.basis.parentBranch === undefined
					? missingExplicitParent()
					: request.basis.parentBranch;
		if (typeof parent !== "string") return parent;
		const tracked = await this.graphite.checkBranchTracked({
			cwd: request.cwd,
			branch: parent,
			signal: request.signal,
		});
		if (!tracked.ok) {
			return { ok: false, error: { ...tracked.error, branchCreated: false } };
		}
		if (!tracked.tracked) {
			return {
				ok: false,
				error: {
					code: "graphite-parent-untracked",
					branchCreated: false,
					message: [
						"Current branch is not tracked by Graphite; refusing to stack a branch context on it.",
						`Parent branch: ${parent}`,
						"No branch was created and no plan was attached.",
						`Track the parent first (gt track ${parent} --parent <its-parent>) or configure [workflow].branch-creation = "plain-git".`,
						"",
						tracked.detail,
					].join("\n"),
				},
			};
		}
		const plain = new PlainGitBranchCreationProvider(this.git);
		const created = await plain.createBranch(request);
		if (!created.ok) return created;
		const track = await this.graphite.trackBranch({
			cwd: request.cwd,
			branch: request.branch,
			parentBranch: parent,
			signal: request.signal,
		});
		if (!track.ok) {
			return {
				ok: false,
				error: {
					code: track.error.code,
					branchCreated: true,
					message: [
						"Created local Git branch but failed to track it with Graphite.",
						`Branch: ${request.branch}`,
						"No attached plan was stored.",
						"No cleanup was attempted; inspect the created branch manually.",
						"",
						track.error.message,
					].join("\n"),
				},
			};
		}
		return {
			ok: true,
			value: {
				startPoint: created.value.startPoint,
				startRef: created.value.startRef,
				relationship: { type: "tracked-parent", parentBranch: parent },
			},
		};
	}
}

function missingExplicitParent(): BranchCreationResult {
	return {
		ok: false,
		error: {
			code: "graphite-parent-required",
			branchCreated: false,
			message: "Graphite branch creation requires an explicit parent branch for an explicit basis.",
		},
	};
}

async function resolveCurrentParent(
	git: BranchCreationGitGateway,
	request: BranchCreationRequest,
): Promise<string | BranchCreationResult> {
	const current = await git.currentBranch({ cwd: request.cwd, signal: request.signal });
	if (current.type === "branch") return current.branch;
	if (current.type === "detached") {
		return {
			ok: false,
			error: {
				code: "detached-head",
				branchCreated: false,
				message:
					"Graphite branch creation requires a named current branch; the current checkout appears to be detached.",
			},
		};
	}
	return { ok: false, error: { ...current.error, branchCreated: false } };
}
