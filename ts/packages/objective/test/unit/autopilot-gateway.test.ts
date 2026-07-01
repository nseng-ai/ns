import type { CommandRunner } from "@sdl/core/command";
import { describe, expect, test } from "vitest";

import { RealAutopilotGateway } from "../../src/operations/autopilot/gateway.ts";

describe("RealAutopilotGateway", () => {
	test("preserves formatted command diagnostics while adding structured details", async () => {
		const runner: CommandRunner = async () => ({
			stdout: "",
			stderr: "whitespace error\n",
			code: 1,
			killed: false,
		});
		const gateway = new RealAutopilotGateway(runner);

		const result = await gateway.diffCheck({ cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("autopilot_diff_check_failed");
		expect(result.error.displayCommand).toBe("git diff --check");
		expect(result.error.message).toContain(
			"git diff --check reported whitespace errors or unresolved conflict markers.",
		);
		expect(result.error.message).toContain("whitespace error");
		expect(result.error.details).toEqual({
			command: "git",
			args: ["diff", "--check"],
			exit_code: 1,
			stderr: "whitespace error",
		});
	});
});
