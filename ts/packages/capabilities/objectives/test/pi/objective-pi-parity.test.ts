import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@nseng-ai/pi/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@nseng-ai/pi/parity/testing";
import { objectiveCommandSpecs, objectiveCreatePatternCommandSpecs } from "../../src/api/index.ts";
import objectiveExtension, { objectiveParity } from "../../src/pi/extension.ts";

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

	test("derives pattern-create command names and parity entries from the pattern", () => {
		for (const spec of objectiveCreatePatternCommandSpecs) {
			expect(spec.commandName).toBe(`ns:objective:create:${spec.pattern}`);
			expect(spec.skillName).toBe(`objective-create-${spec.pattern}`);
			expect(objectiveParity).toContainEqual(
				expect.objectContaining({
					surface: spec.commandName,
					skill: spec.skillName,
					cli: `${spec.skillName} skill (portable)`,
				}),
			);
		}
	});
});
