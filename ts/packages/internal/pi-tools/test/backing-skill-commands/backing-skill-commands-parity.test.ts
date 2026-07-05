import { describe, test } from "vitest";

import { expectPiSurfaceParity } from "@nseng-ai/pi/parity/testing";
import {
	backingSkillCommandsParity,
	registerBackingSkillCommands,
} from "../../src/backing-skill-commands/extension.ts";

describe("backing-skill command Pi extension parity metadata", () => {
	test("generated command surfaces match generated package metadata", async () => {
		await expectPiSurfaceParity(registerBackingSkillCommands, backingSkillCommandsParity);
	});
});
