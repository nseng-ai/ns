import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RealGitBrmemGateway } from "../../src/real-git-gateway.ts";
import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";
import { createTempGitRepo } from "../support/temp-git-repo.ts";

describe("export operation real-Git integration", () => {
	it("wires public export through RealGitBrmemGateway", async () => {
		const repo = createTempGitRepo();
		const root = await makeTempDir();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			expect(
				(
					await gateway.putEntry({
						namespace: "base",
						branch: "source",
						key: "base.md",
						content: "base\n",
					})
				).type,
			).toBe("ok");
			expect(
				(
					await gateway.putEntry({
						namespace: "scratch",
						branch: "source",
						key: "scratch.md",
						content: "scratch\n",
					})
				).type,
			).toBe("ok");
			const outputDir = join(root, "real");
			const run = runScenario(
				["export", "--branch", "source", "--output-dir", outputDir, "--format", "json"],
				{ gateway, cwd: repo.path },
			);
			expect(await run.exit).toBe(0);
			expect(parseJsonOutput(run)).toMatchObject({
				data: { exported: [{ key: "base.md", ref_name: "refs/brmem/base/source:base.md" }] },
			});
			expect(await readFile(join(outputDir, "base.md"), "utf8")).toBe("base\n");
			await expect(readFile(join(outputDir, "scratch.md"), "utf8")).rejects.toMatchObject({
				code: "ENOENT",
			});
		} finally {
			repo.cleanup();
			await rm(root, { recursive: true, force: true });
		}
	});
});

async function makeTempDir(): Promise<string> {
	return await mkdtemp(join(tmpdir(), "brmem-export-test-"));
}
