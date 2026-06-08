import { describe, expect, test } from "bun:test";

import { resolveBrmemCommandCandidates } from "../src/brmem-cli.ts";

describe("brmem-cli compatibility shim", () => {
	test("preserves the legacy pi-extensions import path", () => {
		expect(resolveBrmemCommandCandidates("/tmp", { exists: () => false })).toEqual([
			{ command: "brmem", prefixArgs: [] },
		]);
	});
});
