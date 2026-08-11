import { describe, expect, it } from "vitest";

import { runFilesystemScenario } from "../support/run-filesystem-scenario.ts";

function parseJsonOutput(run: { readonly stdout: readonly string[] }): unknown {
	return JSON.parse(run.stdout.join(""));
}

describe("slot shell show CLI", () => {
	it("publishes help and its machine schema from the filesystem route", async () => {
		const help = runFilesystemScenario(["shell", "show", "-h"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Print the parent-shell wrapper script.");
		expect(help.stdout.join("")).toContain("-s, --shell");

		const schema = runFilesystemScenario(["shell", "show", "--json-schema"]);
		expect(await schema.exit).toBe(0);
		expect(schema.stdout.join("")).toContain('"shell"');
		expect(schema.stdout.join("")).toContain('"script"');
	});

	it("renders the parent-shell wrapper for human output", async () => {
		const run = runFilesystemScenario(["shell", "show", "--shell", "bash"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("ns() {");
		expect(run.stdout.join("")).toContain("NS_CD_DIRECTIVE_FILE=");
		expect(run.stdout.join("")).toContain('command ns "$@"');
	});

	it("returns the already-modern machine outcome and detects the shell from the environment", async () => {
		const run = runFilesystemScenario(["shell", "show", "--format", "json"], {
			env: { PATH: "/fake/bin", SHELL: "/bin/bash" },
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "success",
			data: { shell: "bash", script: expect.stringContaining("ns() {") },
		});
	});

	it("preserves unsupported-shell failure behavior", async () => {
		const run = runFilesystemScenario(["shell", "show", "--shell", "fish", "--format", "json"], {
			env: { PATH: "/fake/bin" },
		});

		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			message: "Shell 'fish' is not supported. Supported shells: zsh, bash.",
		});
	});
});
