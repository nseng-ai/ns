import { inspectClinkrCommandStructure } from "@nseng-ai/clinkr";
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
	test("declares its exact activation and filesystem command contract", async () => {
		const result = validateExtensionDescriptor(objectivesExtension);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.descriptor).not.toHaveProperty("group");
		expect(result.descriptor).not.toHaveProperty("entries");
		expect(result.descriptor.activation).toEqual({
			instructions: EXPECTED_OBJECTIVES_INSTRUCTIONS,
			consumerDirs: [".ns/objectives"],
		});
		expect(result.descriptor.bundledArtifacts).toEqual(
			deriveObjectiveBundledArtifacts(packageManifest),
		);
		if (result.descriptor.commandDirectory === undefined) return;
		const routes = await inspectClinkrCommandStructure(result.descriptor.commandDirectory);
		expect(
			routes.filter((route) => route.type === "command").map((route) => route.path.join("/")),
		).toEqual([
			"objective/check",
			"objective/exec/list-candidates",
			"objective/exec/load-orientations",
			"objective/exec/publication-bind",
			"objective/exec/publication-publish",
			"objective/exec/read-objective",
			"objective/exec/runner-begin",
			"objective/exec/runner-finish",
			"objective/exec/runner-subagent-usage",
			"objective/exec/tracking-gate",
			"objective/list",
			"objective/show",
		]);
		const exec = routes.find((route) => route.path.join("/") === "objective/exec");
		expect(exec).toMatchObject({ type: "group", metadata: { isHidden: true } });
	});
});
