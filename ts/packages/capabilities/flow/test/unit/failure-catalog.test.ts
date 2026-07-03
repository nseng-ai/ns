import { describe, expect, test } from "vitest";

import { defineFailureCatalog } from "../../src/phase-stream/failure-catalog.ts";

describe("failure catalog idiom", () => {
	test("adding a failure arm is one catalog entry", () => {
		type ExampleFailure = { kind: "known"; detail: string } | { kind: "added"; reason: string };

		const catalog = defineFailureCatalog<ExampleFailure, "deterministic", undefined>()({
			known: {
				arm: "known",
				verdict: "deterministic",
				message: (failure) => `known:${failure.kind}`,
			},
			added: {
				arm: "added",
				verdict: "deterministic",
				message: (failure) => `added:${failure.kind}`,
			},
		});

		const failure: ExampleFailure = { kind: "added", reason: "new failure" };
		const entry = catalog[failure.kind];

		expect(entry).toMatchObject({ arm: "added", verdict: "deterministic" });
		expect(entry.message(failure, undefined)).toBe("added:added");
	});
});
