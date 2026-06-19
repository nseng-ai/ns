import { describe, expect, test } from "vitest";

import { RealPrAddressGitGateway, type ProcessRequest } from "../../src/gateways.ts";

describe("RealPrAddressGitGateway", () => {
	test("passes timeout to git commands", async () => {
		const requests: ProcessRequest[] = [];
		const gateway = new RealPrAddressGitGateway({
			runProcess: async (request) => {
				requests.push(request);
				return { stdout: "feature/demo\n", stderr: "", exitCode: 0 };
			},
		});

		const result = await gateway.getCurrentBranch({ cwd: "/repo", env: { PATH: "/fake/bin" } });

		expect(result).toEqual({ type: "branch", branch: "feature/demo" });
		expect(requests).toEqual([
			{
				command: "git",
				args: ["branch", "--show-current"],
				cwd: "/repo",
				env: { PATH: "/fake/bin" },
				timeout: 10_000,
			},
		]);
	});
});
