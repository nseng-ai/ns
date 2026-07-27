import { describe, expect, test } from "vitest";

import {
	chooseActiveObjectiveSlug,
	objectiveSelectionContextFromCommandContext,
} from "@nseng-ai/objectives/api";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { createManualClock } from "@nseng-ai/foundation/time/testing";
import type { CommandContext } from "@nseng-ai/pi-runtime/runtime/types";
import { createTestSessionReader } from "./test-session-reader.ts";

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
			sessionManager: createTestSessionReader(),
			waitForIdle: async () => {},
		};

		const objectiveCtx = objectiveSelectionContextFromCommandContext(ctx);
		objectiveCtx.ui.notify("still visible", "info");

		expect(objectiveCtx.hasUI).toBe(true);
		expect(objectiveCtx.ui.select).toBeUndefined();
		expect(notifications).toEqual(["still visible"]);
	});

	test("objective selection captures one deterministic instant for picker labels", async () => {
		const selections: string[][] = [];
		const ctx: CommandContext = {
			cwd: "/repo",
			hasUI: true,
			ui: {
				notify: () => {},
				select: async (_title, items) => {
					selections.push([...items]);
					return items[0];
				},
			},
			modelRegistry: { find: () => undefined },
			sessionManager: createTestSessionReader(),
			waitForIdle: async () => {},
		};
		let clockReads = 0;
		const manualClock = createManualClock(Date.parse("2026-01-15T00:00:00Z"));
		const host = {
			clock: {
				nowMs: () => {
					clockReads += 1;
					return manualClock.clock.nowMs();
				},
			},
			git: new InMemoryGitGateway(),
			loadObjectiveList: async () => ({
				type: "loaded" as const,
				list: {
					trunkBranch: "master",
					rootPath: "/repo",
					statusFilter: "active" as const,
					namesOnly: false,
					records: [
						{
							slug: "alpha",
							status: "open" as const,
							latestUpdateIso: "2026-01-01T00:00:00Z",
							hasOutstandingChanges: false,
						},
					],
				},
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

		expect(slug).toBe("alpha");
		expect(clockReads).toBe(1);
		expect(selections).toEqual([["alpha — open — latest update 2 weeks ago"]]);
	});

	test("objective selection with notifications but no picker skips picker-only work", async () => {
		const notifications: string[] = [];
		const ctx: CommandContext = {
			cwd: "/repo",
			hasUI: true,
			ui: {
				notify: (message) => notifications.push(message),
			},
			modelRegistry: { find: () => undefined },
			sessionManager: createTestSessionReader(),
			waitForIdle: async () => {},
		};
		let clockReads = 0;
		const manualClock = createManualClock(0);
		const host = {
			clock: {
				nowMs: () => {
					clockReads += 1;
					return manualClock.clock.nowMs();
				},
			},
			git: new InMemoryGitGateway(),
			loadObjectiveList: async () => ({
				type: "loaded" as const,
				list: {
					trunkBranch: "master",
					rootPath: "/repo",
					statusFilter: "active" as const,
					namesOnly: false,
					records: [
						{
							slug: "alpha",
							status: "open" as const,
							latestUpdateIso: null,
							hasOutstandingChanges: false,
						},
					],
				},
			}),
		};

		const slug = await chooseActiveObjectiveSlug(
			host,
			objectiveSelectionContextFromCommandContext(ctx),
			{
				statusKey: "objective:test",
				selectionTitle: "Select an Objective",
				selectionMode: "advancement",
			},
		);

		expect(slug).toBeUndefined();
		expect(notifications).toEqual([]);
		expect(clockReads).toBe(0);
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
			sessionManager: createTestSessionReader(),
			waitForIdle: async () => {},
		};
		const host = {
			clock: createManualClock(0).clock,
			git: new InMemoryGitGateway(),
			loadObjectiveList: async () => ({
				type: "loaded" as const,
				list: {
					trunkBranch: "master",
					rootPath: "/repo",
					statusFilter: "active" as const,
					namesOnly: false,
					records: [],
				},
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
			sessionManager: createTestSessionReader(),
			waitForIdle: async () => {},
		};
		const host = {
			clock: createManualClock(0).clock,
			git: new InMemoryGitGateway(),
			loadObjectiveList: async () => ({ type: "failed" as const, message: "boom" }),
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
