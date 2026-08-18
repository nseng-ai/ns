import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { InMemoryBranchMemoryGateway } from "@nseng-ai/branch-context/testing";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type {
	GitCurrentBranchResult,
	GitLocalBranchTip,
	GitOperationResult,
	GitResult,
} from "@nseng-ai/foundation/git";
import { executeGsBranchFromPlan } from "../src/extension.ts";
import { InMemoryGsGateway } from "../src/testing.ts";

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const operation = {
	branch: "target",
	key: "target.md",
	sourceFile: fileURLToPath(import.meta.url),
};

class WorkflowGitGateway extends InMemoryGitGateway {
	private branch = "feature";
	private targetExists = false;
	private readonly restoreFails: boolean;
	private readonly checkoutTargetAfterCreation: boolean;
	private readonly targetTip: string;
	private readonly tipReadFailure: boolean;

	constructor(
		options: {
			branch?: string;
			targetExists?: boolean;
			restoreFails?: boolean;
			checkoutTargetAfterCreation?: boolean;
			targetTip?: string;
			tipReadFailure?: boolean;
		} = {},
	) {
		super({
			currentBranch: options.branch ?? "feature",
			cachedOriginHeadBranch: "main",
			headCommit: HEAD,
			existingBranches: options.targetExists ? ["target"] : [],
		});
		this.branch = options.branch ?? "feature";
		this.targetExists = options.targetExists ?? false;
		this.restoreFails = options.restoreFails ?? false;
		this.checkoutTargetAfterCreation = options.checkoutTargetAfterCreation ?? true;
		this.targetTip = options.targetTip ?? HEAD;
		this.tipReadFailure = options.tipReadFailure ?? false;
	}

	providerCreatedTarget(): void {
		this.targetExists = true;
		if (this.checkoutTargetAfterCreation) this.branch = "target";
	}

	override async currentBranch(): Promise<GitCurrentBranchResult> {
		return { type: "branch", branch: this.branch };
	}

	override async localBranchPresence(params: {
		branch: string;
	}): Promise<
		| { type: "present"; refName: string; displayCommand: string }
		| { type: "absent"; refName: string }
	> {
		return this.targetExists && params.branch === "target"
			? {
					type: "present",
					refName: "refs/heads/target",
					displayCommand: "git rev-parse --verify refs/heads/target",
				}
			: { type: "absent", refName: `refs/heads/${params.branch}` };
	}

	override async listLocalBranchTips(): Promise<GitResult<readonly GitLocalBranchTip[]>> {
		if (this.tipReadFailure) {
			return { ok: false, error: { code: "git_branch_tips_failed", message: "tip read failed" } };
		}
		return {
			ok: true,
			value: this.targetExists ? [{ name: "target", headSha: this.targetTip, headIso: null }] : [],
		};
	}

	override async checkout(params: { branch: string }): Promise<GitOperationResult> {
		if (this.restoreFails)
			return { ok: false, error: { code: "git_checkout_failed", message: "restore failed" } };
		this.branch = params.branch;
		return { ok: true };
	}
}

function gatewayThatCreates(
	git: WorkflowGitGateway,
	state: ConstructorParameters<typeof InMemoryGsGateway>[0] = {},
) {
	const base = new InMemoryGsGateway(state);
	return {
		base,
		gateway: {
			inspectLocalStack: base.inspectLocalStack.bind(base),
			async addAboveCurrentStack(options: { cwd: string; targetBranch: string }) {
				const result = await base.addAboveCurrentStack(options);
				if (result.ok) git.providerCreatedTarget();
				return result;
			},
			async initializeStack(options: {
				cwd: string;
				trunkBranch: string;
				branches: readonly string[];
			}) {
				const result = await base.initializeStack(options);
				if (result.ok) git.providerCreatedTarget();
				return result;
			},
		},
	};
}

async function run(
	options: {
		git?: WorkflowGitGateway;
		gsState?: ConstructorParameters<typeof InMemoryGsGateway>[0];
		attachFailure?: { code: string; message: string };
	} = {},
) {
	const git = options.git ?? new WorkflowGitGateway();
	const gs = gatewayThatCreates(git, options.gsState);
	const brmem = new InMemoryBranchMemoryGateway(
		options.attachFailure === undefined ? {} : { attachFailure: options.attachFailure },
	);
	const result = await executeGsBranchFromPlan({
		cwd: "/repo",
		context: { git, gs: gs.gateway, brmem },
		operation,
	});
	return { result, git, gs: gs.base, brmem };
}

describe("GS branch-from-plan workflow", () => {
	test("adds above an existing stack, verifies, attaches, and restores", async () => {
		const fixture = await run({
			gsState: {
				inspection: {
					ok: true,
					value: { type: "stacked", currentBranch: "feature", orderedBranches: ["feature"] },
				},
			},
		});
		expect(fixture.result.type).toBe("success");
		expect(fixture.gs.addCalls).toEqual([{ cwd: "/repo", targetBranch: "target" }]);
		expect(fixture.brmem.attachedPlans).toMatchObject([{ branch: "target", key: "target.md" }]);
		expect(await fixture.git.currentBranch()).toEqual({ type: "branch", branch: "feature" });
	});

	test("initializes target from trunk", async () => {
		const fixture = await run({ git: new WorkflowGitGateway({ branch: "main" }) });
		expect(fixture.gs.initializeCalls).toEqual([
			{ cwd: "/repo", trunkBranch: "main", branches: ["target"] },
		]);
	});

	test("adopts an unstacked non-trunk branch below target", async () => {
		const fixture = await run();
		expect(fixture.gs.initializeCalls).toEqual([
			{ cwd: "/repo", trunkBranch: "main", branches: ["feature", "target"] },
		]);
	});

	test("refuses collision without provider or attachment mutation", async () => {
		const fixture = await run({ git: new WorkflowGitGateway({ targetExists: true }) });
		expect(fixture.result).toMatchObject({ type: "failure" });
		expect(fixture.gs.inspectionCalls).toEqual([]);
		expect(fixture.brmem.attachedPlans).toEqual([]);
	});

	test("reports attachment failure with target retained and no rollback", async () => {
		const fixture = await run({
			attachFailure: { code: "put-failed", message: "attachment unavailable" },
		});
		expect(fixture.result.message).toContain("No rollback was attempted");
		expect(fixture.result.message).toContain("attachment unavailable");
	});

	test.each([
		[
			"wrong checkout",
			new WorkflowGitGateway({ checkoutTargetAfterCreation: false }),
			"did not leave the exact target checked out",
		],
		["tip read failure", new WorkflowGitGateway({ tipReadFailure: true }), "tip read failed"],
		[
			"wrong start",
			new WorkflowGitGateway({
				targetTip: "fedcba9876543210fedcba9876543210fedcba98",
			}),
			"not the requested start",
		],
	] as const)("reports partial success and exact recovery for %s", async (_name, git, detail) => {
		const fixture = await run({ git });
		expect(fixture.result.message).toContain("partially succeeded");
		expect(fixture.result.message).toContain("No rollback was attempted");
		expect(fixture.result.message).toContain("Original branch: feature");
		expect(fixture.result.message).toContain("Target branch: target");
		expect(fixture.result.message).toContain("Key: target.md");
		expect(fixture.result.message).toContain("Recovery: git checkout 'feature'");
		expect(fixture.result.message).toContain(detail);
	});

	test("reports complete manual recovery when restoration fails", async () => {
		const fixture = await run({ git: new WorkflowGitGateway({ restoreFails: true }) });
		expect(fixture.result.message).toContain("Original branch: feature");
		expect(fixture.result.message).toContain("Target branch: target");
		expect(fixture.result.message).toContain("Key: target.md");
		expect(fixture.result.message).toContain("Recovery: git checkout 'feature'");
	});
});
