import { describe, expect, test } from "vitest";

import {
	artifactProvisionName,
	HARNESS_ARTIFACT_KINDS,
	type FirstPartyHarnessArtifactCatalog,
} from "../src/artifact-catalog.ts";

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
						relativePath: "skills/objective-next",
					},
				},
				{
					kind: "agent",
					id: "runner-agent",
					name: "Runner agent",
					description: "Runner subagent profile.",
					agentName: "runner",
					source: {
						type: "first-party",
						packageName: "@nseng-ai/ns",
						relativePath: ".ns/pi/agents/runner.md",
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
			"runner",
			"objective",
		]);
	});
});
