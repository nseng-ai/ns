import { describe, expect, test } from "vitest";

import { expectPiSurfaceParity } from "@nseng-ai/pi-runtime/parity/testing";
import { grillUiParity, registerGrillUiExtension } from "../../src/grill/extension.ts";

describe("grill Pi extension parity metadata", () => {
	test("registered command surfaces match both metadata rows", async () => {
		expect(grillUiParity).toHaveLength(2);
		await expectPiSurfaceParity(registerGrillUiExtension, grillUiParity);
	});
});
