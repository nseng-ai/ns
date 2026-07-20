import { describe, expect, test } from "vitest";

import {
	chooseActiveObjectiveSlug,
	objectiveSelectionContextFromCommandContext,
} from "../../src/api/index.ts";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { CommandContext } from "@nseng-ai/pi/runtime/types";
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
		const host = {
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
