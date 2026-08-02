import { validateExtensionDescriptor } from "@nseng-ai/sdk";
import objectivesExtension from "@nseng-ai/objectives/ns-extension";
import { describe, expect, test } from "vitest";

import packageManifest from "../../package.json" with { type: "json" };
import { deriveObjectiveBundledArtifacts } from "../../src/ns/publish-artifacts.ts";

const EXPECTED_OBJECTIVES_INSTRUCTIONS = [
	"## Objectives",
	"",
	"This repository uses ns Objectives: durable planning records under `.ns/objectives/`",
	"that carry work across sessions and branches.",
	"",
	"- Before starting non-trivial work, run `ns objective list` and read any Objective that",
	"  overlaps your task (start with its `objective.md` and `roadmap.md`).",
	"- Also run `ns objective exec load-orientations --format md` and treat any output as",
	"  standing repository rules while present.",
	"- Use the `ns objective` CLI and the objective skills to create, advance, update, and",
	"  close Objectives.",
].join("\n");

describe("Objectives extension descriptor", () => {
	test("declares its exact activation contract", () => {
		const result = validateExtensionDescriptor(objectivesExtension);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.descriptor.activation).toEqual({
			instructions: EXPECTED_OBJECTIVES_INSTRUCTIONS,
			consumerDirs: [".ns/objectives"],
		});
		expect(result.descriptor.bundledArtifacts).toEqual(
			deriveObjectiveBundledArtifacts(packageManifest),
		);
	});

	test("declares the Objective autorun PR title text-content point with its packaged default", async () => {
		const result = validateExtensionDescriptor(objectivesExtension);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.descriptor.points).toEqual([
			{
				id: "objective.autorun.pr-title",
				accepts: "text-content",
				cardinality: "one",
				default: "../publication/templates/autorun-pr-title-default.txt",
				developmentOverrideEnvVar: "NS_OBJECTIVE_AUTORUN_PR_TITLE_TEXT_CONTENT",
				description: "Deterministic title template for Objective autorun pull requests.",
			},
		]);

		const { readFile } = await import("node:fs/promises");
		const { fileURLToPath } = await import("node:url");
		const defaultPath = new URL(
			"../../src/publication/templates/autorun-pr-title-default.txt",
			import.meta.url,
		);
		const content = await readFile(fileURLToPath(defaultPath), "utf8");
		expect(content).toBe(
			"[obj:{{objectiveSlug}}] [autorun:{{autorunOrdinal}}] {{existingTitle}}\n",
		);
	});
});
