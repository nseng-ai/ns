import { describe, expect, it } from "vitest";

import { GS_PACKAGE_NAME } from "../../src/api/index.ts";

describe("gs package scaffold", () => {
	it("exports its package identity", () => {
		expect(GS_PACKAGE_NAME).toBe("@nseng-ai/gs");
	});
});
