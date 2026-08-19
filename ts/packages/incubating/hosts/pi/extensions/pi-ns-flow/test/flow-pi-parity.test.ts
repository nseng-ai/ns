import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@nseng-ai/pi-runtime/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@nseng-ai/pi-runtime/parity/testing";
import { flowSkillBackedCommandRegistrations } from "@nseng-ai/flow/api";
import registerFlowExtension, {
	flowExtensionParity,
	type FlowExtensionAPI,
} from "../src/extension.ts";
import stackSquashExtension, { stackSquashParity } from "../src/stack-squash.ts";

async function collectFlowPiSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, stackSquashExtension);
	await registerWithFakeHost(pi, (host: FlowExtensionAPI) =>
		registerFlowExtension(host, {
			recoveryGit: new InMemoryGitGateway({ optionalRepoRoot: "/repo" }),
			runCli: async () => 0,
		}),
	);
	return pi.surfaces();
}

const flowPiParity = [...stackSquashParity, ...flowExtensionParity] as const;

describe("Flow Pi extension parity metadata", () => {
	test("exports skill-backed command registrations", () => {
		expect(flowSkillBackedCommandRegistrations).toEqual([
			{
				kind: "specialized-command",
				skillName: "ns-flow-autobranch",
				surface: "ns:flow:gt:autobranch",
			},
			{
				kind: "specialized-command",
				skillName: "ns-flow-branch-latest-commit",
				surface: "ns:flow:gt:branch-latest-commit",
			},
			{
				kind: "specialized-command",
				skillName: "ns-flow-cp",
				surface: "ns:flow:cp",
			},
			{
				kind: "specialized-command",
				skillName: "ns-flow-submit",
				surface: "ns:flow:gt:submit",
			},
		]);
	});

	test("registered command surfaces match package metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectFlowPiSurfaces(),
			metadata: flowPiParity,
		});

		if (
			comparison.missingMetadata.length > 0 ||
			comparison.staleMetadata.length > 0 ||
			comparison.duplicateMetadataKeys.length > 0
		) {
			throw new Error(formatParityComparisonFailure(comparison));
		}

		expect(comparison).toEqual({
			missingMetadata: [],
			staleMetadata: [],
			duplicateMetadataKeys: [],
		});
	});
});
