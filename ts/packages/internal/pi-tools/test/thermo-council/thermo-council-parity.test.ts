import { describe, test } from "vitest";

import { expectPiSurfaceParity } from "@nseng-ai/pi/parity/testing";
import thermoCouncilExtension, { thermoCouncilParity } from "../../src/thermo-council/extension.ts";

describe("thermo-council Pi extension parity metadata", () => {
	test("registered command surface matches package metadata", async () => {
		await expectPiSurfaceParity(thermoCouncilExtension, thermoCouncilParity);
	});
});
