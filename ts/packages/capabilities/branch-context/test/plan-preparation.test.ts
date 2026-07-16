import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	createPreparedPlanBranchContext,
	preparePlanBranchContext,
	type BranchContextContext,
} from "@nseng-ai/branch-context/api";
import { InMemoryBranchMemoryGateway } from "@nseng-ai/branch-context/testing";
import { buildPlanContentSlugPrompt } from "@nseng-ai/branch-context/api";
import { buildRawTextModelArgs } from "@nseng-ai/capability-kit/model-slug";
import { InMemoryGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/testing";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { PlanStoreDirectoryEvidence, ValidatedSessionSavedPlan } from "@nseng-ai/plans/api";
import { afterEach, describe, expect, test } from "vitest";

const ROOT = "/repo";
const SOURCE_BRANCH = "feature/source";
const START_POINT = "0123456789abcdef0123456789abcdef01234567";
const PLAN_CONTENT = "# Add dispatch preparation tests\n";
const directories: string[] = [];

class SlugCommands implements CommandExecApi {
	readonly calls: Array<{ command: string; args: string[]; options?: ExecOptions }> = [];

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.calls.push({ command, args: [...args], ...(options === undefined ? {} : { options }) });
		if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
			return exited(`${ROOT}\n`);
		}
		expect({ command, args }).toEqual({
			command: "pi",
			args: buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT)),
		});
		return exited("add-dispatch-preparation-tests\n");
	}
}

function exited(stdout = ""): ExecResult {
	return { type: "exited", stdout, stderr: "", code: 0, signal: null };
}

function checkout(directoryPath: string): PlanStoreDirectoryEvidence {
	return {
		repoRoot: ROOT,
		repoKey: "gh--owner--repo",
		repoIdentitySource: "origin-url",
		repoDirectoryPath: join(directoryPath, ".."),
		sourceBranch: SOURCE_BRANCH,
		branchKey: "feature---source",
		directoryPath,
	};
}

async function fixture(): Promise<{
	plan: ValidatedSessionSavedPlan;
	checkout: PlanStoreDirectoryEvidence;
}> {
	const directoryPath = await mkdtemp(join(tmpdir(), "branch-context-preparation-"));
	directories.push(directoryPath);
	const filePath = join(directoryPath, "saved-plan.md");
	await writeFile(filePath, PLAN_CONTENT, "utf8");
	const evidence = checkout(directoryPath);
	return {
		checkout: evidence,
		plan: {
			...evidence,
			slug: "saved-plan",
			filePath,
			fileName: "saved-plan.md",
			modifiedTimeMs: 1,
			summary: "Implement the owner APIs.",
		},
	};
}

function context(
	options: {
		git?: InMemoryGitGateway;
		brmem?: InMemoryBranchMemoryGateway;
		graphite?: InMemoryGraphiteBranchGateway;
	} = {},
): BranchContextContext {
	return {
		commands: {
			async exec() {
				throw new Error("unexpected context command");
			},
		},
		git: options.git ?? new InMemoryGitGateway(),
		brmem: options.brmem ?? new InMemoryBranchMemoryGateway(),
		graphite: options.graphite ?? new InMemoryGraphiteBranchGateway(),
	};
}

afterEach(async () => {
	await Promise.all(
		directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe("plan branch-context preparation public API", () => {
	test("preview derives the Graphite operation without creating or attaching", async () => {
		const { plan, checkout: checkoutEvidence } = await fixture();
		const git = new InMemoryGitGateway({ headCommit: START_POINT, currentBranch: SOURCE_BRANCH });
		const brmem = new InMemoryBranchMemoryGateway();
		const graphite = new InMemoryGraphiteBranchGateway();
		const commands = new SlugCommands();

		const prepared = await preparePlanBranchContext(commands, {
			plan,
			checkout: checkoutEvidence,
			context: context({ git, brmem, graphite }),
			shouldBuildPreview: true,
		});

		expect(prepared.operation).toMatchObject({
			slug: "add-dispatch-preparation-tests",
			branch: "add-dispatch-preparation-tests",
			branchCreation: "graphite",
			key: "add-dispatch-preparation-tests.md",
			summary: "Implement the owner APIs.",
		});
		if (prepared.type !== "preview") throw new Error("Expected the preview variant.");
		expect(prepared.preview).toContain(`Start point: ${START_POINT}`);
		expect(prepared.preview).toContain(`gt info ${SOURCE_BRANCH} --no-interactive`);
		expect(git.createBranchAtHeadCalls).toEqual([]);
		expect(graphite.trackBranchCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
	});

	test("preparation without preview returns the ready variant with no preview key", async () => {
		const { plan, checkout: checkoutEvidence } = await fixture();

		const prepared = await preparePlanBranchContext(new SlugCommands(), {
			plan,
			checkout: checkoutEvidence,
			context: context(),
		});

		expect(prepared.type).toBe("ready");
		expect("preview" in prepared).toBe(false);
	});

	test("create attaches the selected plan through injected owner gateways", async () => {
		const { plan, checkout: checkoutEvidence } = await fixture();
		const git = new InMemoryGitGateway({
			optionalRepoRoot: { type: "missing" },
			currentBranch: SOURCE_BRANCH,
			headCommit: START_POINT,
		});
		const brmem = new InMemoryBranchMemoryGateway();
		const graphite = new InMemoryGraphiteBranchGateway();
		const ownerContext = context({ git, brmem, graphite });
		const prepared = await preparePlanBranchContext(new SlugCommands(), {
			plan,
			checkout: checkoutEvidence,
			context: ownerContext,
		});

		const evidence = await createPreparedPlanBranchContext(
			{
				async exec() {
					throw new Error("unexpected command");
				},
			},
			prepared,
		);

		expect(evidence).toMatchObject({
			branch: "add-dispatch-preparation-tests",
			key: "add-dispatch-preparation-tests.md",
			sourceFile: await realpath(plan.filePath),
		});
		expect(graphite.trackBranchCalls).toEqual([
			{
				cwd: ROOT,
				branch: "add-dispatch-preparation-tests",
				parentBranch: SOURCE_BRANCH,
			},
		]);
		expect(brmem.attachPlanCalls[0]?.content).toBe(PLAN_CONTENT);
	});

	test("create preserves owner failure evidence and does not attach after Graphite failure", async () => {
		const { plan, checkout: checkoutEvidence } = await fixture();
		const git = new InMemoryGitGateway({
			optionalRepoRoot: { type: "missing" },
			currentBranch: SOURCE_BRANCH,
			headCommit: START_POINT,
		});
		const brmem = new InMemoryBranchMemoryGateway();
		const graphite = new InMemoryGraphiteBranchGateway({
			trackFailure: { code: "track_failed", message: "Graphite refused tracking." },
		});
		const ownerContext = context({ git, brmem, graphite });
		const prepared = await preparePlanBranchContext(new SlugCommands(), {
			plan,
			checkout: checkoutEvidence,
			context: ownerContext,
		});

		await expect(
			createPreparedPlanBranchContext(
				{
					async exec() {
						throw new Error("unexpected command");
					},
				},
				prepared,
			),
		).rejects.toThrow("Graphite refused tracking.");
		expect(git.existingBranches).toContain("add-dispatch-preparation-tests");
		expect(brmem.attachPlanCalls).toEqual([]);
	});
});
