import { describe, expect, it } from "vitest";

import { runCli } from "@sdl/sdl/cli";

describe("sdl slot alias CLI", () => {
	it("mounts the Slot command tree under sdl slot", async () => {
		const run = runScenario(["slot", "--help"]);
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Usage: sdl slot");
		expect(output).toContain("Manage reusable Git worktree slots for parallel branch work.");
		expect(output).toContain("Common flow: slot list → slot checkout <branch>");
		expect(output).toContain("checkout [options]");
		expect(output).toContain("list [options]");
		expect(commandNames(output)).toEqual([
			"checkout",
			"claim",
			"co",
			"completion",
			"free",
			"gc",
			"goto",
			"gt",
			"init",
			"list",
			"ls",
			"resize",
			"shell",
		]);
	});

	it("keeps hidden Slot exec commands invocable under sdl slot", async () => {
		const run = runScenario(["slot", "gt", "exec", "stack-branches", "--help"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("stack-branches");
	});
});

function commandNames(helpText: string): string[] {
	const commandsSection = helpText.split("Commands:\n")[1] ?? "";
	const names: string[] = [];
	for (const line of commandsSection.split("\n")) {
		const name = line.trim().split(/\s+/)[0];
		if (name !== undefined && name !== "") names.push(name);
	}
	return names;
}

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
