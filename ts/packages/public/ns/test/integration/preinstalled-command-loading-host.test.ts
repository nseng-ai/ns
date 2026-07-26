import { describe, expect, test } from "vitest";

import { runNsCliWithFakeContext } from "../support/cli-harness.ts";

describe("preinstalled command loading host integration", () => {
	test("loads summaries from both preinstalled packages for root help", async () => {
		const run = await runNsCliWithFakeContext(["--help"]);

		expect(run.exit).toBe(0);
		expect(run.stdout).toContain("Activate ns in this repository.");
		expect(run.stdout).toContain("Update ns itself.");
		expect(run.stdout).toMatch(/^  extension(?:\s|$)/m);
		expect(run.stdout).toMatch(/^  skills(?:\s|$)/m);
		expect(run.stdout).not.toContain("Load ns descriptor command");
		expect(run.stderr).toBe("");
		expect(run.execCalls).toEqual([]);
	});

	test("loads init help metadata from ns-init", async () => {
		const run = await runNsCliWithFakeContext(["init", "--help"]);

		expect(run.exit).toBe(0);
		expect(run.stdout).toContain("Activate ns in this repository by writing ns.toml");
		expect(run.stdout).toContain(
			"instructions, creating declared consumer directories, and provisioning declared",
		);
		expect(run.stdout).toContain("extension artifacts.");
		expect(run.stdout).toContain("--harness");
		expect(run.stderr).toBe("");
		expect(run.execCalls).toEqual([]);
	});

	test("loads skills list help metadata from harness-artifacts", async () => {
		const run = await runNsCliWithFakeContext(["skills", "list", "--help"]);

		expect(run.exit).toBe(0);
		expect(run.stdout).toContain("Usage: ns skills list");
		expect(run.stdout).toContain(
			"List first-party ns-owned skills available for harness provisioning.",
		);
		expect(run.stderr).toBe("");
		expect(run.execCalls).toEqual([]);
	});
});
