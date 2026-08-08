import { describe, expect, test } from "vitest";

import { runNsCliWithFakeContext } from "../support/cli-harness.ts";

describe("preinstalled command loading host integration", () => {
	test("loads the surviving built-ins for root help", async () => {
		const run = await runNsCliWithFakeContext(["--help"]);

		expect(run.exit).toBe(0);
		expect(run.stdout).toContain("Activate ns in this repository by writing ns.toml");
		const builtIns = helpSection(run.stdout, "Built-ins:");
		const extensions = helpSection(run.stdout, "Extensions:");
		expect(run.stdout.indexOf("Extensions:")).toBeLessThan(run.stdout.indexOf("Built-ins:"));
		for (const name of ["init", "shell", "extension"]) {
			expect(builtIns).toMatch(new RegExp(`^  ${name}(?:\\s|$)`, "m"));
		}
		for (const name of ["skills", "update", "skill-exposure"]) {
			expect(builtIns).not.toMatch(new RegExp(`^  ${name}(?:\\s|$)`, "m"));
			expect(extensions).not.toMatch(new RegExp(`^  ${name}(?:\\s|$)`, "m"));
		}
		expect(run.stderr).toBe("");
		expect(run.execCalls).toEqual([]);
	});

	test("renders the extension namespace including update", async () => {
		const run = await runNsCliWithFakeContext(["extension", "--help"]);

		expect(run.exit).toBe(0);
		expect(run.stdout).toContain("Commands:");
		for (const command of ["install", "list", "update"]) {
			expect(run.stdout).toMatch(new RegExp(`^  ${command}(?:\\||\\s|$)`, "m"));
		}
		expect(run.stderr).toBe("");
	});

	test("loads init help metadata from ns-init", async () => {
		const run = await runNsCliWithFakeContext(["init", "--help"]);

		expect(run.exit).toBe(0);
		expect(run.stdout).toContain("Activate ns in this repository by writing ns.toml");
		expect(run.stdout).not.toContain("--supported-harness");
		expect(run.stderr).toBe("");
	});

	test.each(["skills", "update", "skill-exposure"])(
		"rejects removed %s through ordinary unknown-command behavior",
		async (command) => {
			const run = await runNsCliWithFakeContext([command]);

			expect(run.exit).toBe(2);
			expect(run.stderr).toContain(`unknown route at ${command}`);
			expect(run.stderr).not.toContain("migration");
			expect(run.execCalls).toEqual([]);
		},
	);
});

function helpSection(help: string, heading: string): string {
	const start = help.indexOf(`${heading}\n`);
	if (start === -1) return "";
	const sectionStart = start + heading.length + 1;
	const nextHeading = help.slice(sectionStart).search(/^\S[^\n]*:\n/m);
	return nextHeading === -1
		? help.slice(sectionStart)
		: help.slice(sectionStart, sectionStart + nextHeading);
}
