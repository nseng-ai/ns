import { describe, expect, it } from "vitest";

import {
	parseNsTomlHarnesses,
	planNsTomlHarnessesWrite,
	renderNsTomlHarnesses,
} from "../src/api.ts";

describe("ns.toml harnesses", () => {
	it("parses top-level harnesses", () => {
		expect(parseNsTomlHarnesses('harnesses = ["codex", "claude-code"]\n')).toEqual({
			type: "ok",
			harnesses: ["codex", "claude-code"],
		});
	});

	it("parses harnesses alongside point-system config", () => {
		expect(
			parseNsTomlHarnesses('harnesses = ["pi"]\n\n[points]\n"flow.submit.pre" = ["just"]\n'),
		).toEqual({
			type: "ok",
			harnesses: ["pi"],
		});
	});

	it("ignores table-local harnesses", () => {
		expect(parseNsTomlHarnesses('[areg]\nharnesses = ["codex"]\n')).toEqual({ type: "missing" });
	});

	it("rejects unknown harnesses", () => {
		const result = parseNsTomlHarnesses('harnesses = ["cursor"]\n');
		expect(result.type).toBe("error");
		if (result.type !== "error") throw new Error("expected error");
		expect(result.error.code).toBe("invalid-harnesses");
		expect(result.error.message).toBe(
			'Unknown harness "cursor". Expected one of claude-code, codex, pi.',
		);
	});

	it("rejects invalid harness shapes", () => {
		const result = parseNsTomlHarnesses("harnesses = []\n");
		expect(result.type).toBe("error");
		if (result.type !== "error") throw new Error("expected error");
		expect(result.error).toEqual({
			code: "invalid-harnesses",
			message: "ns.toml top-level harnesses must be a non-empty string array.",
		});
	});

	it("preserves invalid TOML diagnostics", () => {
		const result = parseNsTomlHarnesses("harnesses = [\n");
		expect(result.type).toBe("error");
		if (result.type !== "error") throw new Error("expected error");
		expect(result.error.code).toBe("invalid-toml");
		expect(result.error.message).toContain("Invalid TOML in ns.toml:");
	});

	it("renders explicit top-level harnesses", () => {
		expect(renderNsTomlHarnesses(["codex", "pi"])).toBe('harnesses = ["codex","pi"]\n');
	});

	it("creates, appends, and replaces top-level harnesses", () => {
		expect(planNsTomlHarnessesWrite({ content: undefined, harnesses: ["codex"] })).toEqual({
			type: "ok",
			content: 'harnesses = ["codex"]\n',
			change: "created",
		});
		expect(
			planNsTomlHarnessesWrite({ content: '[areg]\nagents = ["codex"]\n', harnesses: ["pi"] }),
		).toEqual({
			type: "ok",
			content: 'harnesses = ["pi"]\n\n[areg]\nagents = ["codex"]\n',
			change: "appended",
		});
		expect(
			planNsTomlHarnessesWrite({
				content: 'harnesses = ["codex"]\n[areg]\nagents = ["codex"]\n',
				harnesses: ["claude-code"],
			}),
		).toEqual({
			type: "ok",
			content: 'harnesses = ["claude-code"]\n[areg]\nagents = ["codex"]\n',
			change: "replaced",
		});
	});
});
