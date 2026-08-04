import { describe, expect, it } from "vitest";

import slotsExtension from "@nseng-ai/slots/ns-extension";
import { runNsCli } from "../../src/cli/index.ts";

describe("ns slot extension CLI", () => {
	it("keeps CLI metadata on the owning ns entrypoint", async () => {
		const version = runScenario(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toBe("0.1.4\n");

		const runtime = runScenario(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toBe(
			"runtime: typescript\nentry_point: @nseng-ai/ns bin ns -> ts/packages/public/ns/(no package bin)\n",
		);
	});

	it("loads the Slot extension command tree under ns slot", async () => {
		const run = runScenario(["slot", "--help"]);
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Usage: ns slot");
		expect(output).toContain("list|ls");
		expect(output).toContain("checkout|co");
		expect(output).toContain("gt");
	});

	it("keeps hidden Slot extension exec commands invocable under ns slot", async () => {
		const run = runScenario(["slot", "gt", "exec", "stack-branches", "--help"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("stack-branches");
	});

	it("shows canonical ns shell integration from the Slot extension shell command", async () => {
		const run = runScenario(["slot", "shell", "show", "--shell", "zsh"]);
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("ns() {");
		expect(output).toContain("NS_CD_DIRECTIVE_FILE");
		expect(output).toContain('command ns "$@"');
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
	const cwd = process.cwd();
	return {
		exit: runNsCli(args, {
			cwd,
			env: process.env,
			preinstalledSources: () => [
				{
					label: "package:@nseng-ai/slots",
					kind: "preinstalled",
					origin: "package",
					helpClassification: "extension",
					commandDirectory: slotsExtension.commandDirectory,
					package: {
						name: "@nseng-ai/slots",
						version: "0.1.0",
						descriptorPath: "@nseng-ai/slots/ns-extension",
					},
				},
			],
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}
