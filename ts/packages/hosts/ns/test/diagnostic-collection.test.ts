import { describe, expect, test } from "vitest";

import { appendDiagnosticToCollection } from "../src/init/diagnostic-collection.ts";

describe("appendDiagnosticToCollection", () => {
	test("preserves identity, insertion order, and ownership", () => {
		const candidate = { code: "artifact-conflict", message: "conflict", path: "/first" };
		const first = appendDiagnosticToCollection([], candidate);
		candidate.message = "mutated after insertion";

		expect(first).toEqual([{ code: "artifact-conflict", message: "conflict", path: "/first" }]);
		expect(first[0]).not.toBe(candidate);

		const withDistinctPath = appendDiagnosticToCollection(first, {
			code: "artifact-conflict",
			message: "conflict",
			path: "/second",
		});
		const duplicate = appendDiagnosticToCollection(withDistinctPath, {
			code: "artifact-conflict",
			message: "conflict",
			path: "/first",
		});

		expect(duplicate).toBe(withDistinctPath);
		expect(duplicate).toEqual([
			{ code: "artifact-conflict", message: "conflict", path: "/first" },
			{ code: "artifact-conflict", message: "conflict", path: "/second" },
		]);
	});
});
