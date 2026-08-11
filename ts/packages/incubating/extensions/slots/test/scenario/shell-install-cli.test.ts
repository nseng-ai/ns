import { describe, expect, it } from "vitest";

import { runFilesystemScenario } from "../support/run-filesystem-scenario.ts";

function parseJsonOutput(run: { readonly stdout: readonly string[] }): unknown {
	return JSON.parse(run.stdout.join(""));
}

describe("slot shell install CLI", () => {
	it("publishes help and its machine schema from the filesystem route", async () => {
		const help = runFilesystemScenario(["shell", "install", "-h"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain(
			"Install the parent-shell wrapper in the detected or selected rc file.",
		);
		expect(help.stdout.join("")).toContain("-s, --shell");
		expect(help.stdout.join("")).toContain("-y, --yes");

		const schema = runFilesystemScenario(["shell", "install", "--json-schema"]);
		expect(await schema.exit).toBe(0);
		expect(schema.stdout.join("")).toContain('"rcPath"');
		expect(schema.stdout.join("")).toContain('"isAlreadyInstalled"');
		expect(schema.stdout.join("")).toContain('"cancelled"');
	});

	it("preserves interactive cancellation and its already-modern machine outcome", async () => {
		const run = runFilesystemScenario(["shell", "install", "--shell", "bash", "--format", "json"], {
			env: { HOME: "/fake/home", PATH: "/fake/bin" },
			nsConfirmations: [{ type: "declined" }],
		});

		expect(await run.exit).toBe(0);
		expect(run.nsConfirmationPrompts).toEqual([
			"Install ns shell integration for bash in /fake/home/.bashrc?",
		]);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "success",
			data: {
				shell: "bash",
				rcPath: "/fake/home/.bashrc",
				isAlreadyInstalled: false,
				cancelled: true,
			},
		});
	});

	it("preserves unsupported-shell failure behavior before interaction", async () => {
		const run = runFilesystemScenario(["shell", "install", "--shell", "fish", "--format", "json"], {
			env: { HOME: "/fake/home", PATH: "/fake/bin" },
		});

		expect(await run.exit).toBe(2);
		expect(run.nsConfirmationPrompts).toEqual([]);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			message: "Shell 'fish' is not supported. Supported shells: zsh, bash.",
		});
	});
});
