import { describe, expect, it } from "vitest";

import { parseSlotsProvisionConfigToml } from "../../src/core/provision-config.ts";

describe("parseSlotsProvisionConfigToml", () => {
	it("parses declared provision paths, including nested ones", () => {
		const result = parseSlotsProvisionConfigToml(
			'[slots]\nprovision = [".env.local", "ts/packages/capabilities/vercel/.env.local"]\n',
		);
		expect(result).toEqual({
			ok: true,
			value: { provision: [".env.local", "ts/packages/capabilities/vercel/.env.local"] },
		});
	});

	it("returns an empty declaration when the table or key is absent", () => {
		expect(parseSlotsProvisionConfigToml("")).toEqual({ ok: true, value: { provision: [] } });
		expect(parseSlotsProvisionConfigToml("[reviews]\n")).toEqual({
			ok: true,
			value: { provision: [] },
		});
		expect(parseSlotsProvisionConfigToml("[slots]\n")).toEqual({
			ok: true,
			value: { provision: [] },
		});
	});

	it("rejects invalid TOML", () => {
		const result = parseSlotsProvisionConfigToml("[slots\n");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid-toml");
	});

	it("rejects a non-table [slots] value", () => {
		const result = parseSlotsProvisionConfigToml('slots = "nope"\n');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid-slots-table");
	});

	it("rejects a non-array provision value", () => {
		const result = parseSlotsProvisionConfigToml('[slots]\nprovision = ".env.local"\n');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid-provision");
	});

	it("rejects non-string entries", () => {
		const result = parseSlotsProvisionConfigToml("[slots]\nprovision = [1]\n");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid-provision");
	});

	it.each([
		["absolute path", "/etc/passwd"],
		["backslash separator", "dir\\file.env"],
		["trailing slash", ".vercel/"],
		["empty string", ""],
		["dot segment", "./.env.local"],
		["dot-dot segment", "../outside.env"],
		["inner dot-dot segment", "ts/../.env.local"],
		["double slash", "ts//file.env"],
		["glob star", "*.env"],
		["glob question mark", ".env?"],
		["glob bracket", ".env[a]"],
		["glob brace", ".env{a}"],
	])("rejects %s", (_label, path) => {
		const result = parseSlotsProvisionConfigToml(
			`[slots]\nprovision = [${JSON.stringify(path)}]\n`,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid-provision-path");
	});

	it("rejects duplicate entries", () => {
		const result = parseSlotsProvisionConfigToml(
			'[slots]\nprovision = [".env.local", ".env.local"]\n',
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("invalid-provision-path");
			expect(result.error.message).toContain("duplicate");
		}
	});

	it("prefixes messages with the path label when provided", () => {
		const result = parseSlotsProvisionConfigToml('[slots]\nprovision = "x"\n', "custom/ns.toml");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.message).toContain("custom/ns.toml");
	});
});
