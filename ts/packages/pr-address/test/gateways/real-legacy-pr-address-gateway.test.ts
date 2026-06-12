import { describe, expect, test } from "vitest";

import { RealLegacyPrAddressGateway, type ProcessRunRequest } from "../../src/legacy-python.ts";
import { REPO_ROOT } from "../support/golden.ts";

describe("legacy Python fallback routing", () => {
	test("uses local uv project command when a legacy checkout marker is present", async () => {
		const requests: ProcessRunRequest[] = [];
		const gateway = new RealLegacyPrAddressGateway({
			runProcess: async (request) => {
				requests.push(request);
				return 0;
			},
		});

		const exit = await gateway.run(["exec", "unknown-op"], { cwd: REPO_ROOT, env: { PATH: "/fake/bin" } });

		expect(exit).toBe(0);
		expect(requests).toEqual([
			{
				command: "uv",
				args: ["run", "--project", REPO_ROOT, "pr-address-py", "exec", "unknown-op"],
				cwd: REPO_ROOT,
				env: { PATH: "/fake/bin" },
				stdio: "inherit",
			},
		]);
	});

	test("uses pinned uvx fallback outside a legacy checkout", async () => {
		const requests: ProcessRunRequest[] = [];
		const gateway = new RealLegacyPrAddressGateway({
			runProcess: async (request) => {
				requests.push(request);
				return 3;
			},
		});

		const exit = await gateway.run(["exec", "unknown-op"], { cwd: "/", env: { PATH: "/fake/bin" } });

		expect(exit).toBe(3);
		expect(requests).toEqual([
			{
				command: "uvx",
				args: ["--from", "asdl-pr-address==0.1.1", "pr-address", "exec", "unknown-op"],
				cwd: "/",
				env: { PATH: "/fake/bin" },
				stdio: "inherit",
			},
		]);
	});
});
