import { describe, expect, test } from "vitest";

import { runNsCliWithFakeContext } from "../support/cli-harness.ts";

describe("preinstalled command loading host integration", () => {
	test("loads summaries from both preinstalled packages for root help", async () => {
		const run = await runNsCliWithFakeContext(["--help"]);

		expect(run.exit).toBe(0);
		expect(run.stdout).toContain("Activate ns in this repository by writing ns.toml");
		expect(run.stdout).toContain("Update ns itself.");
		const builtIns = helpSection(run.stdout, "Built-ins:");
		const extensions = helpSection(run.stdout, "Extensions:");
		// Extensions lead the help output; Built-ins close it.
		expect(run.stdout.indexOf("Extensions:")).toBeLessThan(run.stdout.indexOf("Built-ins:"));
		// One expected inventory proves membership; Clinkr keeps source declaration order.
		const builtInNames = ["init", "update", "shell", "extension", "skills"];
		for (const name of builtInNames) {
			expect(builtIns).toMatch(new RegExp(`^  ${name}(?:\\s|$)`, "m"));
		}
		for (const [index, name] of builtInNames.entries()) {
			const nextName = builtInNames[index + 1];
			if (nextName === undefined) continue;
			expect(builtIns.search(new RegExp(`^  ${name}(?:\\s|$)`, "m"))).toBeLessThan(
				builtIns.search(new RegExp(`^  ${nextName}(?:\\s|$)`, "m")),
			);
		}
		expect(extensions).not.toMatch(/^  init(?:\s|$)/m);
		expect(extensions).not.toMatch(/^  skills(?:\s|$)/m);
		expect(extensions).not.toMatch(/^  update(?:\s|$)/m);
		expect(extensions).not.toMatch(/^  extension(?:\s|$)/m);
		expect(run.stdout).not.toContain("Load ns descriptor command");
		expect(run.stderr).toBe("");
		expect(run.execCalls).toEqual([]);
	});

	test.each([
		["extension", "install", "list"],
		["skills", "install", "list"],
	])(
		"renders %s namespace commands without root category headings",
		async (namespace, ...commands) => {
			const run = await runNsCliWithFakeContext([namespace, "--help"]);

			expect(run.exit).toBe(0);
			expect(run.stdout).toContain("Commands:");
			expect(run.stdout).not.toContain("Built-ins:");
			expect(run.stdout).not.toContain("Extensions:");
			for (const command of commands) {
				expect(run.stdout).toMatch(new RegExp(`^  ${command}(?:\\||\\s|$)`, "m"));
			}
			expect(run.stderr).toBe("");
			expect(run.execCalls).toEqual([]);
		},
	);

	test("loads init help metadata from ns-init", async () => {
		const run = await runNsCliWithFakeContext(["init", "--help"]);

		expect(run.exit).toBe(0);
		expect(run.stdout).toContain("Activate ns in this repository by writing ns.toml");
		expect(run.stdout).toContain(
			"instructions, creating declared consumer directories, and provisioning declared",
		);
		expect(run.stdout).toContain("extension artifacts.");
		expect(run.stdout).toContain("--supported-harness");
		expect(run.stderr).toBe("");
		expect(run.execCalls).toEqual([]);
	});

	test("loads skills list help metadata from harness-artifacts", async () => {
		const run = await runNsCliWithFakeContext(["skills", "list", "--help"]);

		expect(run.exit).toBe(0);
		expect(run.stdout).toContain("Usage: ns skills list");
		expect(run.stdout).toContain("List first-party ns skills.");
		expect(run.stderr).toBe("");
		expect(run.execCalls).toEqual([]);
	});
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
