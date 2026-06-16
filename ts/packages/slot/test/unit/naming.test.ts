import { describe, expect, it } from "vitest";

import { extractSlotNumber, generateSlotName } from "../../src/naming.ts";

describe("slot naming", () => {
	it("generates two-digit managed slot names", () => {
		expect(generateSlotName(1)).toBe("slot-01");
		expect(generateSlotName(99)).toBe("slot-99");
	});

	it("extracts only exactly two digit slot suffixes", () => {
		expect(extractSlotNumber("slot-07")).toBe("07");
		for (const name of ["slot-7", "slot-100", "slot-xx", "feature-01", "slot-"]) {
			expect(extractSlotNumber(name)).toBeNull();
		}
	});
});
