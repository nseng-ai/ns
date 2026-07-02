import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InMemoryGitGateway } from "@sdl/capability-kit/git/testing";
import {
	createRealPlanStoreGateway,
	encodeBranchForPlanPath,
	findLatestSavedPlanFile,
	resolvePlanSourceFile,
	writeSavedPlanFile,
} from "../../src/index.ts";

const unusedPi = { exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false }) };

describe("RealPlanStoreGateway", () => {
	test("writes saved plans exclusively and latest selection reads real mtimes", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-gateway-"));
		try {
			const repoRoot = join(root, "repo");
			await mkdir(repoRoot, { recursive: true });
			const planStoreRoot = join(root, "store");
			const sourceBranch = "feature/source-plan";
			const git = new InMemoryGitGateway({
				repoRoot,
				originUrl: "git@github.com:owner/repo.git",
				currentBranch: sourceBranch,
				trunkBranch: { type: "missing" },
			});
			const planStoreGateway = createRealPlanStoreGateway();

			const evidence = await writeSavedPlanFile(
				unusedPi,
				{ slug: "real-gateway-saved-plan", content: "# Real\n" },
				{ cwd: repoRoot, planStoreRoot, git, planStoreGateway },
			);

			await expect(
				writeSavedPlanFile(
					unusedPi,
					{ slug: "real-gateway-saved-plan", content: "# Again\n" },
					{ cwd: repoRoot, planStoreRoot, git, planStoreGateway },
				),
			).rejects.toThrow("refusing to overwrite");

			const branchDirectory = join(
				planStoreRoot,
				"gh--owner--repo",
				encodeBranchForPlanPath(sourceBranch),
			);
			const newerPath = join(branchDirectory, "newer-real-saved-plan.md");
			await writeFile(newerPath, "# Newer\n", "utf8");
			const newerDate = new Date(4_102_444_800_000);
			await utimes(newerPath, newerDate, newerDate);

			const latest = await findLatestSavedPlanFile(unusedPi, {
				cwd: repoRoot,
				planStoreRoot,
				git,
				planStoreGateway,
			});
			expect(evidence.filePath).toContain("real-gateway-saved-plan.md");
			expect(latest).toMatchObject({ slug: "newer-real-saved-plan", filePath: newerPath });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("reads explicit source files and rejects repository-internal plans", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-source-"));
		try {
			const repoRoot = join(root, "repo");
			await mkdir(repoRoot, { recursive: true });
			const outsidePlan = join(root, "outside.md");
			const insidePlan = join(repoRoot, "inside.md");
			await writeFile(outsidePlan, "# Outside\n", "utf8");
			await writeFile(insidePlan, "# Inside\n", "utf8");
			const git = new InMemoryGitGateway({ repoRoot, trunkBranch: { type: "missing" } });
			const planStoreGateway = createRealPlanStoreGateway();

			await expect(
				resolvePlanSourceFile(unusedPi, {
					cwd: repoRoot,
					rawFilePath: insidePlan,
					git,
					planStoreGateway,
				}),
			).rejects.toThrow("inside");
			await expect(
				resolvePlanSourceFile(unusedPi, {
					cwd: repoRoot,
					rawFilePath: outsidePlan,
					git,
					planStoreGateway,
				}),
			).resolves.toBe(await realpath(outsidePlan));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
