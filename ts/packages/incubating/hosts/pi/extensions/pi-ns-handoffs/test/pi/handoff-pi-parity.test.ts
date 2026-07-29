import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@nseng-ai/pi-runtime/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@nseng-ai/pi-runtime/parity/testing";
import claudeExtension, { claudeHandoffParity } from "../../src/adapter/claude-extension.ts";
import { handoffSkillBackedCommandRegistrations } from "@nseng-ai/handoffs/api";
import handoffExtension, { handoffParity } from "../../src/adapter/extension.ts";

async function collectHandoffPiSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, handoffExtension);
	await registerWithFakeHost(pi, claudeExtension);
	return pi.surfaces();
}

describe("Handoff Pi extension parity metadata", () => {
	test("exports skill-backed command registrations", () => {
		expect(handoffSkillBackedCommandRegistrations).toEqual([
			{
				kind: "specialized-command",
				skillName: "handoff-create",
				surface: "ns:handoff:create",
			},
			{
				kind: "specialized-command",
				skillName: "handoff-pickup",
				surface: "ns:handoff:pickup",
			},
		]);
	});

	test("registered command surfaces match package metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectHandoffPiSurfaces(),
			metadata: [...handoffParity, ...claudeHandoffParity],
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
