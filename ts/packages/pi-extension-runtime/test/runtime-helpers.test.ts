import { describe, expect, test } from "bun:test";

import { formatCommand, formatExecFailure, formatExecStartupFailure, parseMachineEnvelopeData, stripTerminalEscapes } from "../src/index.ts";
import { chooseActiveObjectiveSlug, objectiveSelectionContextFromCommandContext } from "../src/objective-selection.ts";
import type { CommandContext, ExecResult } from "../src/cmux/types.ts";

describe("pi extension runtime helpers", () => {
	test("formats command displays with shell quoting", () => {
		expect(formatCommand("asdl", ["exec", "cmux-workspace-summary", "--title", "hello world"])).toBe(
			"asdl exec cmux-workspace-summary --title 'hello world'",
		);
	});

	test("parses successful machine-envelope data", () => {
		expect(parseMachineEnvelopeData(JSON.stringify({ exit_code: 0, data: { success: true } }), { label: "example JSON" })).toEqual({
			type: "valid",
			data: { success: true },
		});
	});

	test("formats exec failures with an optional command subject", () => {
		const result = { stdout: "", stderr: "boom", code: 2, killed: false };
		expect(formatExecFailure("objective list", result, { subject: "objective command" }).startsWith("objective command failed (exit code 2)."))
			.toBe(true);
		expect(formatExecStartupFailure("objective list", new Error("missing"), { subject: "objective command" }).startsWith("objective command failed before completion."))
			.toBe(true);
	});

	test("strips terminal escapes", () => {
		expect(stripTerminalEscapes("\u001b[31mred\u001b[0m")).toBe("red");
	});

	test("objective selection context preserves UI notifications without select", async () => {
		const notifications: string[] = [];
		const ctx: CommandContext = {
			cwd: "/repo",
			hasUI: true,
			ui: {
				notify: (message) => notifications.push(message),
			},
			modelRegistry: { find: () => undefined },
			waitForIdle: async () => {},
		};

		const objectiveCtx = objectiveSelectionContextFromCommandContext(ctx);
		objectiveCtx.ui.notify("still visible");

		expect(objectiveCtx.hasUI).toBe(true);
		expect(objectiveCtx.ui.select).toBeUndefined();
		expect(notifications).toEqual(["still visible"]);
	});

	test("objective selection with notifications but no picker skips picker-only work", async () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const notifications: string[] = [];
		const ctx: CommandContext = {
			cwd: "/repo",
			hasUI: true,
			ui: {
				notify: (message) => notifications.push(message),
			},
			modelRegistry: { find: () => undefined },
			waitForIdle: async () => {},
		};
		const host = {
			exec: async (command: string, args: string[]): Promise<ExecResult> => {
				calls.push({ command, args });
				if (command !== "objective") {
					throw new Error(`unexpected command: ${command}`);
				}

				return {
					code: 0,
					killed: false,
					stderr: "",
					stdout: JSON.stringify({
						exit_code: 0,
						data: {
							trunk_branch: "master",
							root_path: "/repo",
							status_filter: "active",
							names_only: false,
							records: [{ slug: "alpha", status: "active", latest_update_iso: null }],
						},
					}),
				};
			},
		};

		const slug = await chooseActiveObjectiveSlug(host, objectiveSelectionContextFromCommandContext(ctx), {
			statusKey: "objective:test",
			selectionTitle: "Select an Objective",
			compactDiffSuggestion: true,
		});

		expect(slug).toBeUndefined();
		expect(calls).toEqual([{ command: "objective", args: ["list", "--format", "json"] }]);
		expect(notifications).toEqual([]);
	});

	test("objective selection with notifications but no picker suppresses empty-list notification", async () => {
		const notifications: string[] = [];
		const ctx: CommandContext = {
			cwd: "/repo",
			hasUI: true,
			ui: {
				notify: (message) => notifications.push(message),
			},
			modelRegistry: { find: () => undefined },
			waitForIdle: async () => {},
		};
		const host = {
			exec: async (): Promise<ExecResult> => ({
				code: 0,
				killed: false,
				stderr: "",
				stdout: JSON.stringify({
					exit_code: 0,
					data: {
						trunk_branch: "master",
						root_path: "/repo",
						status_filter: "active",
						names_only: false,
						records: [],
					},
				}),
			}),
		};

		const slug = await chooseActiveObjectiveSlug(host, objectiveSelectionContextFromCommandContext(ctx), {
			statusKey: "objective:test",
			selectionTitle: "Select an Objective",
		});

		expect(slug).toBeUndefined();
		expect(notifications).toEqual([]);
	});

	test("objective selection with notifications but no picker suppresses list-failure notification", async () => {
		const notifications: string[] = [];
		const ctx: CommandContext = {
			cwd: "/repo",
			hasUI: true,
			ui: {
				notify: (message) => notifications.push(message),
			},
			modelRegistry: { find: () => undefined },
			waitForIdle: async () => {},
		};
		const host = {
			exec: async (): Promise<ExecResult> => ({
				code: 2,
				killed: false,
				stderr: "boom",
				stdout: "",
			}),
		};

		const slug = await chooseActiveObjectiveSlug(host, objectiveSelectionContextFromCommandContext(ctx), {
			statusKey: "objective:test",
			selectionTitle: "Select an Objective",
		});

		expect(slug).toBeUndefined();
		expect(notifications).toEqual([]);
	});
});
