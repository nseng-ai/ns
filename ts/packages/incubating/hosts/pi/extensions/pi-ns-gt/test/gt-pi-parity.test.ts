import { describe, expect, test } from "vitest";
import { comparePiSurfaceParity, type LivePiSurface } from "@nseng-ai/pi-runtime/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@nseng-ai/pi-runtime/parity/testing";
import registerGtExtension, { gtExtensionParity } from "../src/extension.ts";

async function collectSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, (host: Parameters<typeof registerGtExtension>[0]) =>
		registerGtExtension(host),
	);
	return pi.surfaces();
}

describe("GT Pi extension parity metadata", () => {
	test("registered command surfaces match package metadata", async () => {
		expect(
			comparePiSurfaceParity({
				liveSurfaces: await collectSurfaces(),
				metadata: gtExtensionParity,
			}),
		).toEqual({
			missingMetadata: [],
			staleMetadata: [],
			duplicateMetadataKeys: [],
		});
	});
});
