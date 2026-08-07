import { describe, expect, it } from "vitest";

import { parseNsTomlExtensions } from "../src/harness-artifacts/api.ts";

describe("ns.toml extensions", () => {
	it("parses top-level extensions, including an explicitly empty declaration set", () => {
		expect(parseNsTomlExtensions('extensions = ["../local-ext", "/opt/ext"]\n')).toEqual({
			type: "ok",
			extensions: ["../local-ext", "/opt/ext"],
		});
		expect(parseNsTomlExtensions("extensions = []\n")).toEqual({
			type: "ok",
			extensions: [],
		});
	});

	it.each(["", "# unrelated config\r\n"])(
		"reports missing extensions for absent empty and non-empty TOML",
		(content) => {
			expect(parseNsTomlExtensions(content)).toEqual({ type: "missing" });
		},
	);

	it("ignores table-local extensions", () => {
		expect(parseNsTomlExtensions('[areg]\nextensions = ["../local-ext"]\n')).toEqual({
			type: "missing",
		});
	});

	it("rejects invalid extension declarations", () => {
		for (const content of ['extensions = [""]\n', "extensions = [1]\n"]) {
			const result = parseNsTomlExtensions(content);
			expect(result.type).toBe("error");
			if (result.type !== "error") throw new Error("expected error");
			expect(result.error.code).toBe("invalid-extensions");
		}
	});

	it("preserves invalid TOML diagnostics", () => {
		const result = parseNsTomlExtensions("extensions = [\n");
		expect(result.type).toBe("error");
		if (result.type !== "error") throw new Error("expected error");
		expect(result.error.code).toBe("invalid-toml");
		expect(result.error.message).toContain("Invalid TOML in ns.toml:");
	});
});
