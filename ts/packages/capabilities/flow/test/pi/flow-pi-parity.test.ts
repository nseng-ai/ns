import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@nseng-ai/pi/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@nseng-ai/pi/parity/testing";
import codeExtension from "../../src/pi/code-extension.ts";
import codeWorkflowsExtension, { codeWorkflowsParity } from "../../src/pi/code-workflows.ts";
import nsExtension, { nsExtensionParity, type NsExtensionAPI } from "../../src/pi/ns-extension.ts";
import { smartRestackParity } from "../../src/pi/smart-restack.ts";
import { stackSquashParity } from "../../src/pi/stack-squash.ts";

async function collectFlowPiSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, codeWorkflowsExtension);
	await registerWithFakeHost(pi, codeExtension);
	await registerWithFakeHost(pi, (host: NsExtensionAPI) =>
		nsExtension(host, { runCli: async () => 0 }),
	);
	return pi.surfaces();
}

const flowPiParity = [
	...codeWorkflowsParity,
	...smartRestackParity,
	...stackSquashParity,
	...nsExtensionParity,
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
