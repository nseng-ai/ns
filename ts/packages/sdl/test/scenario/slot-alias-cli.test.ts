import { describe, expect, it } from "vitest";

import { runCli } from "@sdl/sdl/cli";

describe("sdl slot alias CLI", () => {
	it("mounts the Slot command tree under sdl slot", async () => {
		const run = runScenario(["slot", "--help"]);
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Usage: sdl slot");
		expect(output).toContain("list [options]");
		expect(output).toContain("checkout [options]");
		expect(output).toContain("gt");
	});

	it("keeps hidden Slot exec commands invocable under sdl slot", async () => {
		const run = runScenario(["slot", "gt", "exec", "stack-branches", "--help"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("stack-branches");
	});
});

function runScenario(args: readonly string[]): {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
} {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		exit: runCli(args, {
			cwd: process.cwd(),
			env: process.env,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}
