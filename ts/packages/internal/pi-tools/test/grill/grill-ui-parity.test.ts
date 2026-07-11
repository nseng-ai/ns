import { describe, test } from "vitest";

import { expectPiSurfaceParity, type FakePiSurfaceHost } from "@nseng-ai/pi/parity/testing";
import { grillUiParity, registerGrillUiExtension } from "../../src/grill/extension.ts";

describe("grill Pi extension parity metadata", () => {
	test("registered command surfaces match package metadata", async () => {
		// The side-quest commands register only on hosts with session-entry
		// capabilities; extend the fake host so all metadata rows go live.
		await expectPiSurfaceParity((pi: FakePiSurfaceHost) => {
			const sidequestCapablePi = Object.assign(pi, {
				appendEntry: () => {},
				setLabel: () => {},
			});
			registerGrillUiExtension(sidequestCapablePi);
		}, grillUiParity);
	});
});
