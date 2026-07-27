import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@nseng-ai/pi-runtime/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@nseng-ai/pi-runtime/parity/testing";
import { objectiveCommandSpecs } from "@nseng-ai/objectives/api";
import objectiveExtension, { objectiveParity } from "../src/extension.ts";

async function collectObjectivePiSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, objectiveExtension);
	return pi.surfaces();
}

describe("Objective Pi extension parity metadata", () => {
	test("registered command surfaces match package metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectObjectivePiSurfaces(),
			metadata: objectiveParity,
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

	test("derives command names and CLI parity text from explicit Objective CLI subcommands", () => {
		for (const spec of objectiveCommandSpecs) {
			expect(spec.commandName).toBe(`ns:objective:${spec.cliSubcommand}`);
			expect(objectiveParity).toContainEqual(
				expect.objectContaining({
					surface: spec.commandName,
					cli: `ns objective ${spec.cliSubcommand}`,
				}),
			);
		}
	});
});
