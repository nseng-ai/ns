import { rmSync } from "node:fs";
import process from "node:process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadNsCommandCatalog, loadSelectedNsCommand } from "../../src/extensions/registry.ts";
import { installCheckedInFlowExtension } from "../helpers/flow-extension.ts";
import { runCliWithFakes } from "../scenario/ns-cli-fakes.ts";

const tempDirs: string[] = [];

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("checked-in flow ns extension registry loading", () => {
	test("source-development discovery retains manifest-validated package identity", async () => {
		const catalog = await loadNsCommandCatalog({ cwd: process.cwd() });

		expect(catalog.extensionPackageNames.has("@nseng-ai/flow")).toBe(true);
		expect(catalog.extensionPackageNames.has("@nseng-ai/slots")).toBe(true);
	});

	test("real loader discovers and imports every checked-in flow command entry", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ns-flow-extension-registry-"));
		tempDirs.push(directory);
		const cwd = join(directory, "project");
		const homeDir = join(directory, "home");
		installCheckedInFlowExtension(cwd);

		const catalog = await loadNsCommandCatalog({
			cwd,
			homeDir: homeDir,
		});

		expect(catalog.diagnostics).toEqual([]);
		const flowCandidates = [...catalog.candidates].filter(
			([_key, candidate]) => candidate.source.level === "project",
		);
		expect(flowCandidates.map(([key]) => key)).toEqual([
			"flow/autobranch",
			"flow/autoslot",
			"flow/branch-latest-commit",
			"flow/changes",
			"flow/cp",
			"flow/exec/read-graphite-branch-metadata",
			"flow/land",
			"flow/pull-trunk",
			"flow/push",
			"flow/regenerate-pr",
			"flow/squash-stack",
			"flow/submit",
		]);

		const failures: string[] = [];
		for (const [key, candidate] of flowCandidates) {
			const loaded = await loadSelectedNsCommand(candidate);
			if (!loaded.ok) failures.push(`${key}: ${loaded.diagnostic.message}`);
		}
		expect(failures).toEqual([]);
	});

	test("checked-in flow exec operation is hidden from flow help but invocable through exec help", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ns-flow-extension-help-"));
		tempDirs.push(directory);
		const cwd = join(directory, "project");
		installCheckedInFlowExtension(cwd);

		const flowHelp = runCliWithFakes(
			{ args: ["flow", "--help"], state: { exec: [] }, cwd },
			{ execResponses: () => [], textGenerationResults: () => [] },
		);
		expect(await flowHelp.exit).toBe(0);
		expect(flowHelp.stdout.join("")).not.toContain("exec");
		expect(flowHelp.stdout.join("")).not.toContain("read-graphite-branch-metadata");

		const execHelp = runCliWithFakes(
			{ args: ["flow", "exec", "--help"], state: { exec: [] }, cwd },
			{ execResponses: () => [], textGenerationResults: () => [] },
		);
		expect(await execHelp.exit).toBe(0);
		expect(execHelp.stdout.join("")).toContain("read-graphite-branch-metadata");
	});
});
