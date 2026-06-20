import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	RealNpmPublishGateway,
	RealPypiPublishGateway,
	type CommandRunner,
} from "../../src/publish-gateways.ts";

function tempProject(): string {
	return mkdtempSync(join(tmpdir(), "packagechk-publish-test-"));
}

describe("publish gateways", () => {
	test("PyPI publishing uses async split core-exec-style commands", async () => {
		const projectDir = tempProject();
		const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
		const runner: CommandRunner = async (command, args, options) => {
			calls.push({ command, args: [...args], cwd: options.cwd });
			if (command === "uv") {
				mkdirSync(join(projectDir, "dist"));
				writeFileSync(join(projectDir, "dist", "sample.tar.gz"), "artifact");
			}
			return { stdout: "", stderr: "", code: 0, killed: false };
		};
		try {
			const gateway = new RealPypiPublishGateway({
				toolFinder: () => "/bin/tool",
				commandRunner: runner,
			});

			expect(gateway.ensurePublishToolsAvailable()).toBeNull();
			const buildResult = await gateway.buildPackage(projectDir);
			expect(buildResult).toEqual({ artifacts: [join(projectDir, "dist", "sample.tar.gz")] });
			expect(
				await gateway.publishArtifacts(projectDir, [join(projectDir, "dist", "sample.tar.gz")]),
			).toBeNull();

			expect(calls).toEqual([
				{ command: "uv", args: ["build"], cwd: projectDir },
				{
					command: "uvx",
					args: ["uv-publish", join(projectDir, "dist", "sample.tar.gz")],
					cwd: projectDir,
				},
			]);
		} finally {
			rmSync(projectDir, { recursive: true, force: true });
		}
	});

	test("npm publish failures use shared command failure formatting", async () => {
		const runner: CommandRunner = async () => ({
			stdout: "",
			stderr: "publish denied",
			code: 1,
			killed: false,
		});
		const gateway = new RealNpmPublishGateway({
			toolFinder: () => "/bin/npm",
			commandRunner: runner,
		});

		const error = await gateway.publishProject("/tmp/project");

		expect(error).toContain("npm publish failed (exit code 1).");
		expect(error).toContain("Command: npm publish --access=public");
		expect(error).toContain("publish denied");
	});
});
