import { describe, expect, test } from "vitest";

import { composeCodeExtensions } from "../../../../../../../../.pi/lib/code-extension-composition.mts";

describe("project-local code extension composition", () => {
	test("registers smart restack before exactly one Flow stack-squash composition", () => {
		const registrations: string[] = [];
		const extension = composeCodeExtensions(
			() => registrations.push("smart-restack"),
			() => registrations.push("flow-stack-squash"),
		);

		extension({});

		expect(registrations).toEqual(["smart-restack", "flow-stack-squash"]);
		expect(registrations.filter((name) => name === "flow-stack-squash")).toHaveLength(1);
	});
});
