import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NodeCommandExecApi } from "@sdl/core/exec";
import type { StdinCapableCommandExecApi } from "@sdl/core/exec";
import { RealGitGateway } from "@sdl/git";

import { RealGitBrmemGateway } from "../../src/real-git-gateway.ts";
import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";
import { createTempGitRepo } from "@sdl/git/testing";

describe("export operation real-Git integration", () => {
	it("wires public export through RealGitBrmemGateway", async () => {
		const repo = createTempGitRepo();
		const root = await makeTempDir();
		try {
			const gateway = realGitBrmemGateway(repo.path);
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
				data: { exported: [{ key: "base.md", refName: "refs/brmem/base/source:base.md" }] },
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

function realGitBrmemGateway(
	cwd: string,
	commands: StdinCapableCommandExecApi = new NodeCommandExecApi(),
): RealGitBrmemGateway {
	return new RealGitBrmemGateway({ cwd, commands, git: new RealGitGateway(commands) });
}

async function makeTempDir(): Promise<string> {
	return await mkdtemp(join(tmpdir(), "brmem-export-test-"));
}
