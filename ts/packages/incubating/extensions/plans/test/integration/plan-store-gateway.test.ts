import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, realpath, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import {
	createRealPlanStoreGateway,
	encodeBranchForPlanPath,
	findLatestSavedPlanFile,
	resolvePlanSourceFile,
	savePlanContentBytes,
	writeSavedPlanFile,
} from "../../src/index.ts";

const unusedPi = {
	exec: async () => ({ type: "exited" as const, stdout: "", stderr: "", code: 0, signal: null }),
};

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
				cachedOriginHeadBranch: { type: "missing" },
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
			const newerPath = join(branchDirectory, "newer-real-saved-plan--26-01-02T03-04-05--1.md");
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

	test("writes complete bytes with the next canonical sequence", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-publication-"));
		try {
			const repoRoot = join(root, "repo");
			await mkdir(repoRoot, { recursive: true });
			const planStoreRoot = join(root, "store");
			const git = new InMemoryGitGateway({
				repoRoot,
				originUrl: "git@github.com:owner/repo.git",
				currentBranch: "feature/source-plan",
			});
			const gateway = createRealPlanStoreGateway();
			const firstContent = new TextEncoder().encode("# First Useful Plan\r\n");
			const first = await savePlanContentBytes(unusedPi, firstContent, {
				cwd: repoRoot,
				planStoreRoot,
				git,
				planStoreGateway: gateway,
				localTimestamp: "26-01-02T03-04-05",
			});
			const secondContent = new TextEncoder().encode("# Second Useful Plan\n");
			const second = await savePlanContentBytes(unusedPi, secondContent, {
				cwd: repoRoot,
				planStoreRoot,
				git,
				planStoreGateway: gateway,
				localTimestamp: "26-01-02T03-04-05",
			});

			expect(first.fileName).toBe("first-useful-plan--26-01-02T03-04-05--1.md");
			expect(second.fileName).toBe("second-useful-plan--26-01-02T03-04-05--2.md");
			expect([...(await gateway.readRegularFileBytes(first.filePath))]).toEqual([...firstContent]);
			expect([...(await gateway.readRegularFileBytes(second.filePath))]).toEqual([
				...secondContent,
			]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("realpath fallback is limited to missing paths", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-realpath-errors-"));
		try {
			const gateway = createRealPlanStoreGateway();
			await expect(gateway.realpathOrResolve(join(root, "missing"))).resolves.toBe(
				join(root, "missing"),
			);
			const regularFile = join(root, "regular-file");
			await writeFile(regularFile, "not a directory", "utf8");
			await expect(gateway.realpathOrResolve(join(regularFile, "child"))).rejects.toMatchObject({
				code: "ENOTDIR",
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("rejects a symlink supplied as the content file", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-symlink-"));
		try {
			const target = join(root, "target.md");
			const link = join(root, "link.md");
			await writeFile(target, "# Target\n", "utf8");
			await symlink(target, link);
			await expect(createRealPlanStoreGateway().readRegularFileBytes(link)).rejects.toThrow(
				"non-symlink",
			);
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
			const git = new InMemoryGitGateway({ repoRoot, cachedOriginHeadBranch: { type: "missing" } });
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
