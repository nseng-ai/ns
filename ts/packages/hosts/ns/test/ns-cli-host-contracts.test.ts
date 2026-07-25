import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	dataFromEnvelope,
	parseJsonOutput,
	runNsCliWithFakeContext,
} from "./support/cli-harness.ts";

function helpSection(help: string, heading: string): string {
	const start = help.indexOf(`${heading}\n`);
	if (start === -1) return "";
	const sectionStart = start + heading.length + 1;
	const nextHeading = help.slice(sectionStart).search(/^\S[^\n]*:\n/m);
	return nextHeading === -1
		? help.slice(sectionStart)
		: help.slice(sectionStart, sectionStart + nextHeading);
}

async function runJson(args: readonly string[]) {
	return await runNsCliWithFakeContext(args, { format: "json" });
}

describe("ns CLI host contracts", () => {
	test("does not inject Objective preinstalled command metadata", async () => {
		const run = await runNsCliWithFakeContext(["--help"]);

		expect(run.exit).toBe(0);
		expect(run.stdout).not.toContain("objective");
		expect(run.stdout).not.toContain("Usage: ns objective list");
		expect(run.stderr).toBe("");
		expect(run.execCalls).toEqual([]);
	});

	test("groups root built-in commands together in top-level help", async () => {
		const run = await runNsCliWithFakeContext(["--help"]);
		const builtIns = helpSection(run.stdout, "Built-ins:");

		expect(run.exit).toBe(0);
		for (const command of ["init", "update", "shell", "completion", "extension", "skills"]) {
			expect(builtIns).toMatch(new RegExp(`^  ${command}(?:\\s|$)`, "m"));
		}
		expect(run.stdout).not.toContain("Extensions:");
		expect(run.stdout).not.toContain("\nCommands:\n");
		expect(run.stderr).toBe("");
		expect(run.execCalls).toEqual([]);
	});

	test("injects ns init preinstalled command metadata", async () => {
		const run = await runNsCliWithFakeContext(["init", "--help"]);

		expect(run.exit).toBe(0);
		expect(run.stdout).toContain("Usage: ns init");
		expect(run.stdout).toContain("Activate ns in this repository by writing ns.toml");
		expect(run.stderr).toBe("");
		expect(run.execCalls).toEqual([]);
	});

	test("merges extension lifecycle commands with SDK point commands and exposes no aliases", async () => {
		const help = await runNsCliWithFakeContext(["extension", "--help"]);

		expect(help.exit).toBe(0);
		for (const command of ["install", "list", "uninstall", "point", "points"]) {
			expect(help.stdout).toContain(`  ${command}`);
		}
		expect(help.stderr).toBe("");
		expect(help.execCalls).toEqual([]);

		for (const args of [
			["install", "./extension"],
			["uninstall", "./extension"],
			["remove", "./extension"],
			["extension", "remove", "./extension"],
		]) {
			const alias = await runJson(args);
			expect(alias.exit).toBe(2);
			expect(alias.stderr).toContain("unknown command");
			expect(alias.execCalls).toEqual([]);
		}
	});

	test("publishes extension install help, schema, and usage contracts", async () => {
		const help = await runNsCliWithFakeContext(["extension", "install", "-h"]);
		expect(help.exit).toBe(0);
		expect(help.stdout).toContain("Usage: ns extension install [options] <source>");
		expect(help.stdout).not.toContain("--harness");
		expect(help.stdout).not.toContain("--yes");
		expect(help.stdout).not.toContain("--force");

		const schemaRun = await runNsCliWithFakeContext(["extension", "install", "--json-schema"]);
		expect(schemaRun.exit).toBe(0);
		const schema = JSON.parse(schemaRun.stdout) as Record<string, unknown>;
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(schemaRun.stdout).toContain("sourceSpec");
		expect(schemaRun.stdout).toContain("completed");

		const usage = await runJson(["extension", "install"]);
		expect(usage.exit).toBe(2);
		expect(parseJsonOutput(usage)).toMatchObject({
			status: "usageError",
			errorType: "usageError",
		});
		for (const run of [help, schemaRun, usage]) expect(run.execCalls).toEqual([]);
	});

	test("publishes extension list help, schema, and usage contracts", async () => {
		const helpRun = await runNsCliWithFakeContext(["extension", "list", "-h"]);
		expect(helpRun.exit).toBe(0);
		expect(helpRun.stdout).toContain("Usage: ns extension list|ls [options]");
		expect(helpRun.stdout).toContain("without\nacquiring packages or changing files");
		expect(helpRun.stdout).not.toContain("--yes");
		expect(helpRun.stdout).not.toContain("--force");

		const schemaRun = await runNsCliWithFakeContext(["extension", "list", "--json-schema"]);
		expect(schemaRun.exit).toBe(0);
		const schema = JSON.parse(schemaRun.stdout) as Record<string, unknown>;
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(schemaRun.stdout).toContain("sourceSpec");
		expect(schemaRun.stdout).toContain("acquisitionStatus");
		expect(schemaRun.stdout).toContain("affectedArtifactCount");

		const usage = await runJson(["extension", "list", "unexpected"]);
		expect(usage.exit).toBe(2);
		expect(parseJsonOutput(usage)).toMatchObject({
			status: "usageError",
			errorType: "usageError",
		});
		for (const run of [helpRun, schemaRun, usage]) expect(run.execCalls).toEqual([]);
	});

	test("publishes extension uninstall help, schema, and usage contracts", async () => {
		const helpRun = await runNsCliWithFakeContext(["extension", "uninstall", "-h"]);
		expect(helpRun.exit).toBe(0);
		expect(helpRun.stdout).toContain("Usage: ns extension uninstall [options] <source>");
		expect(helpRun.stdout).not.toContain("--harness");
		expect(helpRun.stdout).not.toContain("--yes");
		expect(helpRun.stdout).not.toContain("--force");

		const schemaRun = await runNsCliWithFakeContext(["extension", "uninstall", "--json-schema"]);
		expect(schemaRun.exit).toBe(0);
		const schema = JSON.parse(schemaRun.stdout) as Record<string, unknown>;
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(schemaRun.stdout).toContain("sourceIdentity");
		expect(schemaRun.stdout).toContain("cleanup");

		const usage = await runJson(["extension", "uninstall"]);
		expect(usage.exit).toBe(2);
		expect(parseJsonOutput(usage)).toMatchObject({ status: "usageError", errorType: "usageError" });
		for (const run of [helpRun, schemaRun, usage]) expect(run.execCalls).toEqual([]);
	});

	test("lists first-party ns skills", async () => {
		const run = await runNsCliWithFakeContext(["skills", "list"], { gitRoot: "not-found" });

		expect(run.exit).toBe(0);
		expect(run.stdout).toContain("ns first-party skills");
		expect(run.stdout).toContain("objective (objective-skill)");
		expect(run.stderr).toBe("");
		expect(run.execCalls).toEqual(["git rev-parse --show-toplevel"]);
	});

	test("smokes skills path host wiring for an alias user-scope case", async () => {
		const run = await runNsCliWithFakeContext(
			["skills", "path", "objective", "--harness", "claude", "--scope", "user", "--format", "json"],
			{ gitRoot: "not-found" },
		);
		const expectedRoot = join("/config/claude", "skills");
		const data = dataFromEnvelope(parseJsonOutput(run));

		expect(run.exit).toBe(0);
		expect(data).toMatchObject({
			skill: "objective",
			artifactId: "objective-skill",
			harness: "claude-code",
			scope: "user",
			targetRoot: expectedRoot,
			targetArtifactPath: join(expectedRoot, "objective"),
		});
		expect(run.stderr).toBe("");
		expect(run.execCalls).toEqual(["git rev-parse --show-toplevel"]);
	});

	test("injects ns update preinstalled command metadata", async () => {
		const run = await runNsCliWithFakeContext(["update", "--help"]);

		expect(run.exit).toBe(0);
		expect(run.stdout).toContain("Usage: ns update");
		expect(run.stdout).toContain("Reserved ns self-update surface");
		expect(run.stdout).not.toContain("--extensions");
		expect(run.stdout).not.toContain("--all");
		expect(run.stdout).not.toContain("--force");
		expect(run.stderr).toBe("");
		expect(run.execCalls).toEqual([]);
	});

	test("bare ns update reports self-update not implemented", async () => {
		const run = await runNsCliWithFakeContext(["update", "--format", "json"], {
			gitRoot: "not-found",
		});
		const envelope = parseJsonOutput(run);

		expect(run.exit).toBe(2);
		expect(envelope).toMatchObject({
			status: "failure",
			errorType: "self-update-not-implemented",
		});
		expect(envelope.message).toContain("ns extension update <source>");
		expect(run.execCalls).toEqual(["git rev-parse --show-toplevel"]);
	});

	test("rejects the retired top-level extension update flags", async () => {
		const run = await runJson(["update", "--extensions"]);

		expect(run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ status: "usageError", exitCode: 2 });
		expect(run.execCalls).toEqual([]);
	});
});
