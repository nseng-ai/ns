import { describe, expect, test } from "vitest";

import {
	chooseActiveObjectiveSlug,
	objectiveSelectionContextFromCommandContext,
} from "../../src/api/index.ts";
import type { CommandContext, ExecResult } from "@ns/pi/runtime/types";

describe("objective selection runtime behavior", () => {
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
		objectiveCtx.ui.notify("still visible", "info");

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
						exitCode: 0,
						data: {
							trunkBranch: "master",
							rootPath: "/repo",
							statusFilter: "active",
							namesOnly: false,
							records: [{ slug: "alpha", status: "active", latestUpdateIso: null }],
						},
					}),
				};
			},
		};

		const slug = await chooseActiveObjectiveSlug(
			host,
			objectiveSelectionContextFromCommandContext(ctx),
			{
				statusKey: "objective:test",
				selectionTitle: "Select an Objective",
				shouldCompactDiffSuggestion: true,
			},
		);

		expect(slug).toBeUndefined();
		expect(calls).toEqual([]);
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
					exitCode: 0,
					data: {
						trunkBranch: "master",
						rootPath: "/repo",
						statusFilter: "active",
						namesOnly: false,
						records: [],
					},
				}),
			}),
		};

		const slug = await chooseActiveObjectiveSlug(
			host,
			objectiveSelectionContextFromCommandContext(ctx),
			{
				statusKey: "objective:test",
				selectionTitle: "Select an Objective",
			},
		);

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

		const slug = await chooseActiveObjectiveSlug(
			host,
			objectiveSelectionContextFromCommandContext(ctx),
			{
				statusKey: "objective:test",
				selectionTitle: "Select an Objective",
			},
		);

		expect(slug).toBeUndefined();
		expect(notifications).toEqual([]);
	});
});
