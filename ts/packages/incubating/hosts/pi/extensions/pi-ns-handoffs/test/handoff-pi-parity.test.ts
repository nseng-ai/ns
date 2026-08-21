import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@nseng-ai/pi-runtime/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@nseng-ai/pi-runtime/parity/testing";
import { handoffSkillBackedCommandRegistrations } from "@nseng-ai/handoffs/api";
import handoffExtension, { handoffParity } from "../src/extension.ts";

async function collectHandoffPiSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, handoffExtension);
	return pi.surfaces();
}

describe("Handoff Pi extension parity metadata", () => {
	test("imports Skill-Backed Command Registrations from the Handoffs API", () => {
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
			metadata: handoffParity,
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
