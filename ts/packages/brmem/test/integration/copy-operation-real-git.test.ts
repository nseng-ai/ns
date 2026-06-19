import { describe, expect, it } from "vitest";

import { RealGitBrmemGateway } from "../../src/real-git-gateway.ts";
import { mustSnapshotRef } from "../../src/ref-layout.ts";
import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";
import { createTempGitRepo } from "../support/temp-git-repo.ts";

describe("copy operation real-Git integration", () => {
	it("wires public copy through RealGitBrmemGateway and preserves dry-run refs", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			expect(
				(
					await gateway.putEntry({
						namespace: "base",
						branch: "source",
						key: "source.md",
						content: "source\n",
					})
				).type,
			).toBe("ok");
			expect(
				(
					await gateway.putEntry({
						namespace: "base",
						branch: "dest",
						key: "dest.md",
						content: "dest\n",
					})
				).type,
			).toBe("ok");
			const sourceRef = mustSnapshotRef("base", "source");
			const destRef = mustSnapshotRef("base", "dest");
			const sourceSha = repo.runGit(["rev-parse", sourceRef]).trim();
			const destBefore = repo.runGit(["rev-parse", destRef]).trim();

			const dryRun = runScenario(
				[
					"copy",
					"--base",
					"--from-branch",
					"source",
					"--to-branch",
					"dest",
					"--overwrite",
					"--dry-run",
					"--format",
					"json",
				],
				{
					gateway,
					cwd: repo.path,
				},
			);
			expect(await dryRun.exit).toBe(0);
			expect(parseJsonOutput(dryRun)).toMatchObject({
				data: { dry_run: true, copied: [{ key: "source.md" }] },
			});
			expect(repo.runGit(["rev-parse", destRef]).trim()).toBe(destBefore);

			const copy = runScenario(
				["copy", "--base", "--from-branch", "source", "--to-branch", "dest", "--overwrite"],
				{ gateway, cwd: repo.path },
			);
			expect(await copy.exit).toBe(0);
			expect(repo.runGit(["rev-parse", destRef]).trim()).toBe(sourceSha);
			expect(repo.runGit(["show", `${destRef}:source.md`])).toBe("source\n");
		} finally {
			repo.cleanup();
		}
	});
});
