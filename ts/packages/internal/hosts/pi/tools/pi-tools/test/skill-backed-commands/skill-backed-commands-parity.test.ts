import { describe, test } from "vitest";

import { expectPiSurfaceParity } from "@nseng-ai/pi-runtime/parity/testing";
import {
	skillBackedCommandsParity,
	registerSkillBackedCommands,
} from "../../src/skill-backed-commands/extension.ts";

describe("skill-backed command Pi extension parity metadata", () => {
	test("generated command surfaces match generated package metadata", async () => {
		await expectPiSurfaceParity(registerSkillBackedCommands, skillBackedCommandsParity);
	});
});
