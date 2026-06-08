import { describe, expect, test } from "vitest";

import { CCC_PACKAGE_IDENTITY } from "../src/index.ts";

describe("CCC package identity", () => {
	test("records the private orchestration package boundary", () => {
		expect(CCC_PACKAGE_IDENTITY).toMatchObject({
			packageName: "@asdl/ccc",
			vocabularyName: "CCC",
			expandedName: "Cmux Command and Control",
			visibility: "private-workspace",
		});
		expect(CCC_PACKAGE_IDENTITY.ownedConcerns).toContain("cmux-workspace-orchestration");
	});
});
