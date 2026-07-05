import { describe, test } from "vitest";

import { expectPiSurfaceParity } from "@nseng-ai/pi/parity/testing";
import { grillUiParity, registerGrillUiExtension } from "../../src/grill/extension.ts";

describe("grill Pi extension parity metadata", () => {
	test("registered command surfaces match package metadata", async () => {
		await expectPiSurfaceParity(registerGrillUiExtension, grillUiParity);
	});
});
