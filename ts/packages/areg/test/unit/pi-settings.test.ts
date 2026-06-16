import { describe, expect, test } from "vitest";

import { parsePiSettings } from "../../src/operations/pi-settings.ts";

describe("Pi settings parser", () => {
	test("missing settings return empty structured data", () => {
		expect(parsePiSettings({ type: "missing" }, { type: "missing" })).toEqual({
			ok: true,
			value: { text: undefined, data: undefined, exclusions: [] },
		});
	});

	test("refuses symlinked Pi directory", () => {
		expect(parsePiSettings({ type: "symlink", target: "../pi" }, { type: "missing" })).toEqual({
			ok: false,
			error: { code: "path_symlink", message: ".pi is a symlink; refusing to inspect Pi settings." },
		});
	});

	test("refuses non-directory Pi directory states", () => {
		expect(parsePiSettings({ type: "file" }, { type: "missing" })).toEqual({ ok: false, error: { code: "path_not_directory", message: ".pi exists but is not a directory." } });
		expect(parsePiSettings({ type: "other" }, { type: "missing" })).toEqual({ ok: false, error: { code: "path_not_directory", message: ".pi exists but is not a directory." } });
	});

	test("refuses symlinked settings file", () => {
		expect(parsePiSettings({ type: "directory" }, { type: "symlink", target: "../settings.json" })).toEqual({
			ok: false,
			error: { code: "path_symlink", message: ".pi/settings.json is a symlink; refusing to inspect Pi settings." },
		});
	});

	test("refuses non-file settings states", () => {
		expect(parsePiSettings({ type: "directory" }, { type: "directory" })).toEqual({ ok: false, error: { code: "path_not_file", message: ".pi/settings.json exists but is not a file." } });
		expect(parsePiSettings({ type: "directory" }, { type: "other" })).toEqual({ ok: false, error: { code: "path_not_file", message: ".pi/settings.json exists but is not a file." } });
		expect(parsePiSettings({ type: "directory" }, { type: "unreadable", message: "permission denied" })).toEqual({ ok: false, error: { code: "path_not_file", message: ".pi/settings.json exists but is not a file." } });
	});

	test("reports invalid JSON", () => {
		const result = parsePiSettings({ type: "directory" }, { type: "file", text: "not json" });

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.message).toContain("Invalid JSON in .pi/settings.json:");
	});

	test("requires a JSON object", () => {
		expect(parsePiSettings({ type: "directory" }, { type: "file", text: "[]" })).toEqual({
			ok: false,
			error: { code: "pi_settings_not_object", message: ".pi/settings.json must contain a JSON object." },
		});
	});

	test("preserves text and parsed data when skills are absent", () => {
		const text = "{\"theme\":\"dark\"}";

		expect(parsePiSettings({ type: "directory" }, { type: "file", text })).toEqual({
			ok: true,
			value: { text, data: { theme: "dark" }, exclusions: [] },
		});
	});

	test("requires skills to be an array of strings", () => {
		expect(parsePiSettings({ type: "directory" }, { type: "file", text: "{\"skills\":[1]}" })).toEqual({
			ok: false,
			error: { code: "pi_settings_skills_not_string_array", message: ".pi/settings.json field 'skills' must be an array of strings." },
		});
	});

	test("returns valid skill exclusions", () => {
		const text = "{\"skills\":[\"-skills/demo\"]}";

		expect(parsePiSettings({ type: "directory" }, { type: "file", text })).toEqual({
			ok: true,
			value: { text, data: { skills: ["-skills/demo"] }, exclusions: ["-skills/demo"] },
		});
	});
});
