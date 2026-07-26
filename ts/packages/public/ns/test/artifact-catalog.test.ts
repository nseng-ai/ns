import { describe, expect, test } from "vitest";

import {
	artifactProvisionName,
	HARNESS_ARTIFACT_KINDS,
	type FirstPartyHarnessArtifactCatalog,
} from "../src/harness-artifacts/artifact-catalog.ts";

describe("harness artifact catalog model", () => {
	test("represents the three thread artifact kinds", () => {
		expect(HARNESS_ARTIFACT_KINDS).toEqual(["skill", "agent", "extension-bundle"]);
	});

	test("uses kind-specific provision names in the first-party catalog shape", () => {
		const catalog = {
			type: "first-party-catalog",
			catalogId: "ns-first-party",
			artifacts: [
				{
					kind: "skill",
					id: "objective-next-skill",
					name: "Objective next skill",
					description: "Objective workflow instructions.",
					skillName: "objective-next",
					source: {
						type: "first-party",
						packageName: "@nseng-ai/ns",
						relativePath: "skills/incubating/objectives/objective-next",
					},
				},
				{
					kind: "agent",
					id: "task-agent",
					name: "Task agent",
					description: "Focused task subagent profile.",
					agentName: "task",
					source: {
						type: "first-party",
						packageName: "@nseng-ai/ns",
						relativePath: ".ns/pi/agents/task.md",
					},
				},
				{
					kind: "extension-bundle",
					id: "objective-extension-bundle",
					name: "Objective extension bundle",
					description: "Objective command extension bundle.",
					bundleName: "objective",
					source: {
						type: "first-party",
						packageName: "@nseng-ai/ns",
						relativePath: ".ns/extensions/objective",
					},
				},
			],
		} as const satisfies FirstPartyHarnessArtifactCatalog;

		expect(catalog.artifacts.map(artifactProvisionName)).toEqual([
			"objective-next",
			"task",
			"objective",
		]);
	});
});
