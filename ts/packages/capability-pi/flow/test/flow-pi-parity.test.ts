import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@sdl/pi/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@sdl/pi/parity/testing";
import codeExtension from "../src/code-extension.ts";
import codeWorkflowsExtension, { codeWorkflowsParity } from "../src/code-workflows.ts";
import sdlExtension, { sdlExtensionParity } from "../src/sdl-extension.ts";
import { smartRestackParity } from "../src/smart-restack.ts";
import { stackSquashParity } from "../src/stack-squash.ts";

async function collectFlowPiSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, codeWorkflowsExtension);
	await registerWithFakeHost(pi, codeExtension);
	await registerWithFakeHost(pi, sdlExtension);
	return pi.surfaces();
}

const flowPiParity = [
	...codeWorkflowsParity,
	...smartRestackParity,
	...stackSquashParity,
	...sdlExtensionParity,
] as const;

describe("Flow Pi extension parity metadata", () => {
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
