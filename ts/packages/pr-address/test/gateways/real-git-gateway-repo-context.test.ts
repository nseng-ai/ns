import { describe, expect, test } from "vitest";

import { RealPrAddressGitGateway, type ProcessRequest, type ProcessResult } from "../../src/gateways.ts";

function gatewayReturning(result: ProcessResult): RealPrAddressGitGateway {
	return new RealPrAddressGitGateway({ runProcess: async () => result });
}

describe("RealPrAddressGitGateway.getRestructuredFiles", () => {
	test("parses rename and copy status lines while ignoring ordinary changes", async () => {
		const requests: ProcessRequest[] = [];
		const gateway = new RealPrAddressGitGateway({
			runProcess: async (request) => {
				requests.push(request);
				return {
					stdout: "R100\tsrc/old.ts\tsrc/new.ts\nC75\tsrc/base.ts\tsrc/copy.ts\nM\tsrc/edit.ts\nRbad\tsrc/weird.ts\tsrc/weird-new.ts\n",
					stderr: "",
					exitCode: 0,
				};
			},
		});

		const result = await gateway.getRestructuredFiles("master", { cwd: "/repo", env: { PATH: "/fake/bin" } });

		expect(result).toEqual({
			ok: true,
			value: [
				{ status: "R100", old_path: "src/old.ts", new_path: "src/new.ts", similarity: 100 },
				{ status: "C75", old_path: "src/base.ts", new_path: "src/copy.ts", similarity: 75 },
				{ status: "Rbad", old_path: "src/weird.ts", new_path: "src/weird-new.ts", similarity: null },
			],
		});
		expect(requests).toEqual([
			{
				command: "git",
				args: ["diff", "--name-status", "-M", "-C", "origin/master...HEAD"],
				cwd: "/repo",
				env: { PATH: "/fake/bin" },
				timeout: 10_000,
			},
		]);
	});
});

describe("RealPrAddressGitGateway.isInsideWorkTree", () => {
	test("issues the exact git command with cwd, env, and timeout", async () => {
		const requests: ProcessRequest[] = [];
		const gateway = new RealPrAddressGitGateway({
			runProcess: async (request) => {
				requests.push(request);
				return { stdout: "true\n", stderr: "", exitCode: 0 };
			},
		});

		const result = await gateway.isInsideWorkTree({ cwd: "/repo", env: { PATH: "/fake/bin" } });

		expect(result).toEqual({ type: "inside" });
		expect(requests).toEqual([
			{
				command: "git",
				args: ["rev-parse", "--is-inside-work-tree"],
				cwd: "/repo",
				env: { PATH: "/fake/bin" },
				timeout: 10_000,
			},
		]);
	});

	test("maps exit 0 with non-true stdout to outside", async () => {
		// `git rev-parse --is-inside-work-tree` prints "false" inside a bare repo's .git directory.
		const result = await gatewayReturning({ stdout: "false\n", stderr: "", exitCode: 0 }).isInsideWorkTree({ cwd: "/bare/.git" });
		expect(result).toEqual({ type: "outside" });
	});

	test("maps exit 128 (not a git repository) to outside", async () => {
		const result = await gatewayReturning({ stdout: "", stderr: "fatal: not a git repository", exitCode: 128 }).isInsideWorkTree({ cwd: "/tmp" });
		expect(result).toEqual({ type: "outside" });
	});

	test("maps any other non-zero exit to failure with process details", async () => {
		const result = await gatewayReturning({ stdout: "partial", stderr: "git: boom", exitCode: 1 }).isInsideWorkTree({ cwd: "/repo" });
		expect(result).toMatchObject({ type: "failure", failure: { stdout: "partial", stderr: "git: boom", returncode: 1 } });
	});
});
