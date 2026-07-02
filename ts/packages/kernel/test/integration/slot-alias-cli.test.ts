import { describe, expect, it } from "vitest";

import { runCli } from "@sdl/kernel/cli";

describe("sdl slot CLI", () => {
	it("keeps CLI metadata on the owning sdl entrypoint", async () => {
		const version = runScenario(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toBe("0.1.0\n");

		const runtime = runScenario(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toBe(
			"runtime: typescript\nentry_point: @sdl/kernel bin sdl -> ts/packages/kernel/src/cli/index.ts\n",
		);
	});

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

	it("shows canonical SDL shell integration from sdl slot shell", async () => {
		const run = runScenario(["slot", "shell", "show", "--shell", "zsh"]);
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("sdl() {");
		expect(output).toContain("SDL_CD_DIRECTIVE_FILE");
		expect(output).toContain('command sdl "$@"');
		expect(output).not.toContain("slot() {");
		expect(output).not.toContain('command slot "$@"');
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
