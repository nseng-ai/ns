import { describe, expect, test } from "vitest";

import { CMUX_PACKAGE_IDENTITY } from "../src/api/index.ts";

describe("cmux package identity", () => {
	test("records the private orchestration package boundary", () => {
		expect(CMUX_PACKAGE_IDENTITY).toMatchObject({
			packageName: "@nseng-ai/cmux",
			vocabularyName: "cmux",
			visibility: "private-workspace",
			ownedConcerns: ["cmux-workspace-orchestration"],
		});
	});
});
