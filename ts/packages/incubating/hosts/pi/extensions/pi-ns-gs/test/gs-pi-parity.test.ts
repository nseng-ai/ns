import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
} from "@nseng-ai/pi-runtime/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@nseng-ai/pi-runtime/parity/testing";
import registerGsExtension, { gsExtensionParity, type GsExtensionAPI } from "../src/extension.ts";

describe("GS Pi parity", () => {
	test("registered surface matches package metadata", async () => {
		const pi = new FakePiSurfaceHost();
		await registerWithFakeHost(pi, (host: GsExtensionAPI) =>
			registerGsExtension(host, { runCli: async () => 0 }),
		);
		const comparison = comparePiSurfaceParity({
			liveSurfaces: pi.surfaces(),
			metadata: gsExtensionParity,
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
