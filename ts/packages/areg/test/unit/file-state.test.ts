import { describe, expect, test } from "vitest";

import { isPathStateError } from "../../src/operations/file-state.ts";

describe("file state errors", () => {
	const pathErrorCodes = ["path_symlink", "path_not_file", "path_not_directory"] as const;

	test.each(pathErrorCodes)("classifies %s as a path state error", (code) => {
		expect(isPathStateError({ code })).toBe(true);
	});

	test("does not classify non-path error codes as path state errors", () => {
		expect(isPathStateError({ code: "pi_settings_invalid_json" })).toBe(false);
		expect(isPathStateError({ code: "path_read_failed" })).toBe(false);
	});
});
