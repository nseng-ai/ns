import { describe, expect, test } from "vitest";

import { defineFailureCatalog } from "../../src/phase-stream/failure-catalog.ts";

describe("failure catalog idiom", () => {
	test("adding a failure arm is one catalog entry", () => {
		type ExampleFailure = { kind: "known"; detail: string } | { kind: "added"; reason: string };

		const catalog = defineFailureCatalog<ExampleFailure, "deterministic", undefined>()({
			known: {
				verdict: "deterministic",
				message: (failure) => `known:${failure.detail}`,
			},
			added: {
				verdict: "deterministic",
				message: (failure) => {
					// @ts-expect-error known-arm fields are not available in the added entry.
					const wrongArmDetail = failure.detail;
					if (wrongArmDetail) return wrongArmDetail;
					return `added:${failure.reason}`;
				},
			},
		});

		const failure: ExampleFailure = { kind: "added", reason: "new failure" };
		const entry = catalog[failure.kind];

		expect(entry).toMatchObject({ verdict: "deterministic" });
		expect(entry.message(failure, undefined)).toBe("added:new failure");
	});
});
