import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@nseng-ai/pi-runtime/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@nseng-ai/pi-runtime/parity/testing";
import nsExtension, { nsExtensionParity, type NsExtensionAPI } from "../../src/pi/ns-extension.ts";
import stackSquashExtension, { stackSquashParity } from "../../src/pi/stack-squash.ts";

async function collectFlowPiSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, stackSquashExtension);
	await registerWithFakeHost(pi, (host: NsExtensionAPI) =>
		nsExtension(host, {
			recoveryGit: new InMemoryGitGateway({ optionalRepoRoot: "/repo" }),
			runCli: async () => 0,
		}),
	);
	return pi.surfaces();
}

const flowPiParity = [...stackSquashParity, ...nsExtensionParity] as const;

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
