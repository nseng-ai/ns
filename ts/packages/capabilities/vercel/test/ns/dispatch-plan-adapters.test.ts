import { join } from "node:path";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import {
	buildRepoPlanStoreKey,
	encodeBranchForPlanPath,
	resolveExplicitSavedPlanFile,
} from "@nseng-ai/plans/api";
import { InMemoryPlanStoreGateway } from "@nseng-ai/plans/testing";
import { describe, expect, test } from "vitest";

import { RealDispatchSavedPlanGateway } from "../../src/ns/dispatch-plan/adapters.ts";

const ROOT = "/repo";
const PLAN_STORE_ROOT = "/state/ns/enriched-plan";
const SOURCE_BRANCH = "feature/cache";
const ORIGIN = "git@github.com:owner/repo.git";
const PLAN_CONTENT = "# Add cache\n\nImplement the cache safely.\n";

const unusedCommands = {
	exec: async () => ({ type: "exited" as const, stdout: "", stderr: "", code: 0, signal: null }),
};

function fixture() {
	const planStoreGateway = new InMemoryPlanStoreGateway();
	const repoKey = buildRepoPlanStoreKey(ROOT, ORIGIN);
	const branchKey = encodeBranchForPlanPath(SOURCE_BRANCH);
	const filePath = join(PLAN_STORE_ROOT, repoKey, branchKey, "add-cache-safely.md");
	const git = new InMemoryGitGateway({
		repoRoot: ROOT,
		currentBranch: SOURCE_BRANCH,
		originUrl: ORIGIN,
	});
	const gateway = new RealDispatchSavedPlanGateway({
		commands: unusedCommands,
		resolveExplicitSavedPlan: async (commands, options) => {
			return await resolveExplicitSavedPlanFile(commands, {
				...options,
				planStoreRoot: PLAN_STORE_ROOT,
				planStoreGateway,
				git,
			});
		},
	});
	return { gateway, planStoreGateway, filePath };
}

describe("RealDispatchSavedPlanGateway", () => {
	test("resolves and reads an explicit Saved Plan through the curated Plans API", async () => {
		const { gateway, planStoreGateway, filePath } = fixture();
		planStoreGateway.writeFile(filePath, PLAN_CONTENT);

		await expect(
			gateway.resolveExplicitSavedPlan({ cwd: ROOT, planRef: filePath }),
		).resolves.toEqual({
			type: "resolved",
			plan: {
				filePath,
				slug: "add-cache-safely",
				sourceBranch: SOURCE_BRANCH,
				content: PLAN_CONTENT,
			},
		});
	});

	test("classifies missing and unsafe explicit references without reading arbitrary files", async () => {
		const { gateway, filePath } = fixture();

		await expect(
			gateway.resolveExplicitSavedPlan({ cwd: ROOT, planRef: filePath }),
		).resolves.toMatchObject({ type: "not-found", message: expect.stringContaining(filePath) });
		await expect(
			gateway.resolveExplicitSavedPlan({ cwd: ROOT, planRef: "/tmp/not-a-saved-plan.md" }),
		).resolves.toMatchObject({
			type: "unsafe",
			message: expect.stringContaining("outside the current source branch's local plan store"),
		});
	});
});
