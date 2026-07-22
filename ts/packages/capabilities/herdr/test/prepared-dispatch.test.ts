import { describe, expect, test } from "vitest";

import { dispatchPreparedBranch } from "../src/core/prepared-dispatch.ts";
import { FakeHerdrGateway } from "./herdr-test-harness.ts";

function slotClient(worktreePath: string) {
	return {
		async checkoutCurrent() {
			return {
				ok: false as const,
				failure: { errorType: "unexpected", message: "unexpected current checkout" },
			};
		},
		async checkoutBranch(options: { branchName: string }) {
			return {
				ok: true as const,
				target: {
					slotName: "slot-07",
					branchName: options.branchName,
					worktreePath,
					isAlreadyAssigned: false,
					hasCreatedBranch: false,
					currentWorktreeNote: null,
				},
			};
		},
	};
}

const failingSlotClient = {
	async checkoutCurrent() {
		return {
			ok: false as const,
			failure: { errorType: "unexpected", message: "unexpected current checkout" },
		};
	},
	async checkoutBranch() {
		return {
			ok: false as const,
			failure: { errorType: "checkout-failed", message: "slot unavailable" },
		};
	},
};

const payload = {
	branchName: "implement-feature-2",
	semanticSlug: "implement-feature",
	launchCommand: "pi 'implement'",
};

describe("prepared Herdr dispatch", () => {
	test("labels a workspace from the actual managed slot path and launches explicitly", async () => {
		const herdr = new FakeHerdrGateway();

		const result = await dispatchPreparedBranch(
			{
				herdr,
				slotClient: slotClient("/state/slots/repos/ns/worktrees/slot-07"),
				notify: () => {},
			},
			{ payload, destination: { type: "workspace" } },
		);

		expect(result).toMatchObject({
			type: "opened",
			destination: "workspace",
			target: {
				label: "s7:implement-feature",
				workspaceId: "fake-ws-1",
				tabId: "fake-ws-1:t1",
				paneId: "fake-ws-1:p1",
			},
		});
		expect(herdr.createWorkspaceCalls).toEqual([
			{
				options: { cwd: "/state/slots/repos/ns/worktrees/slot-07", label: "s7:implement-feature" },
			},
		]);
		expect(herdr.paneRunCalls).toEqual([{ paneId: "fake-ws-1:p1", command: "pi 'implement'" }]);
	});

	test("labels a workspace without a slot prefix outside a managed slot", async () => {
		const herdr = new FakeHerdrGateway();

		const result = await dispatchPreparedBranch(
			{
				herdr,
				slotClient: slotClient("/ordinary/worktree"),
				notify: () => {},
			},
			{ payload, destination: { type: "workspace" } },
		);

		expect(result).toMatchObject({
			type: "opened",
			target: { label: "implement-feature" },
		});
		expect(herdr.createWorkspaceCalls[0]?.options.label).toBe("implement-feature");
	});

	test("labels a caller tab with the semantic slug rather than the collision branch", async () => {
		const herdr = new FakeHerdrGateway();

		const result = await dispatchPreparedBranch(
			{
				herdr,
				slotClient: slotClient("/ordinary/worktree"),
				notify: () => {},
			},
			{ payload, destination: { type: "tab", callerWorkspaceId: "caller-ws" } },
		);

		expect(result).toMatchObject({ type: "opened", destination: "tab" });
		expect(herdr.createTabCalls).toEqual([
			{
				options: {
					workspaceId: "caller-ws",
					cwd: "/ordinary/worktree",
					label: "implement-feature",
					shouldFocus: true,
				},
			},
		]);
	});

	test("stops before destination creation when slot checkout fails", async () => {
		const herdr = new FakeHerdrGateway();
		const notifications: string[] = [];

		const result = await dispatchPreparedBranch(
			{
				herdr,
				slotClient: failingSlotClient,
				notify: (message) => notifications.push(message),
			},
			{ payload, destination: { type: "workspace" } },
		);

		expect(result).toMatchObject({ type: "failed", stage: "slot-checkout" });
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.paneRunCalls).toEqual([]);
		expect(notifications.join("\n")).toContain("slot unavailable");
	});

	test.each([
		{
			name: "workspace",
			destination: { type: "workspace" } as const,
			failureOptions: {
				createWorkspaceResult: { type: "failed" as const, message: "workspace unavailable" },
			},
		},
		{
			name: "tab",
			destination: { type: "tab", callerWorkspaceId: "caller-ws" } as const,
			failureOptions: {
				createTabResult: { type: "failed" as const, message: "tab unavailable" },
			},
		},
	])(
		"stops before pane launch when $name creation fails",
		async ({ destination, failureOptions }) => {
			const herdr = new FakeHerdrGateway(failureOptions);
			const notifications: string[] = [];

			const result = await dispatchPreparedBranch(
				{
					herdr,
					slotClient: slotClient("/ordinary/worktree"),
					notify: (message) => notifications.push(message),
				},
				{ payload, destination },
			);

			expect(result).toMatchObject({ type: "failed", stage: "destination-create" });
			expect(herdr.paneRunCalls).toEqual([]);
			expect(notifications.join("\n")).toContain("unavailable");
		},
	);

	test.each([
		{
			name: "workspace",
			destination: { type: "workspace" } as const,
			paneId: "fake-ws-1:p1",
			tabId: "fake-ws-1:t1",
			expectedNotification: "Opened Herdr workspace, but failed to launch command.",
			expectedStatuses: [
				"checking out branch slot…",
				"opening Herdr workspace…",
				"launching command in Herdr workspace…",
			],
		},
		{
			name: "tab",
			destination: { type: "tab", callerWorkspaceId: "caller-ws" } as const,
			paneId: "fake-ws-1:p2",
			tabId: "fake-ws-1:t2",
			expectedNotification: "Created Herdr tab, but failed to launch command.",
			expectedStatuses: [
				"checking out branch slot…",
				"creating Herdr tab…",
				"launching command in Herdr tab…",
			],
		},
	])(
		"preserves $name evidence when pane launch fails",
		async ({ destination, paneId, tabId, expectedNotification, expectedStatuses }) => {
			const herdr = new FakeHerdrGateway({
				paneRunResult: { type: "failed", message: "pane unavailable" },
			});
			const notifications: string[] = [];
			const statuses: Array<string | undefined> = [];

			const result = await dispatchPreparedBranch(
				{
					herdr,
					slotClient: slotClient("/ordinary/worktree"),
					notify: (message) => notifications.push(message),
					onStatus: (message) => statuses.push(message),
				},
				{ payload, destination },
			);

			expect(result).toMatchObject({
				type: "failed",
				stage: "pane-launch",
				target: { branchName: "implement-feature-2" },
				workspaceId: "fake-ws-1",
				tabId,
				paneId,
			});
			expect(herdr.createWorkspaceCalls.length + herdr.createTabCalls.length).toBe(1);
			expect(herdr.paneRunCalls).toEqual([{ paneId, command: "pi 'implement'" }]);
			expect(notifications).toHaveLength(1);
			expect(notifications[0]).toContain(expectedNotification);
			expect(notifications[0]).toContain("Branch: implement-feature-2");
			expect(notifications[0]).toContain("Workspace: fake-ws-1");
			expect(notifications[0]).toContain(`Tab: ${tabId}`);
			expect(notifications[0]).toContain(`Pane: ${paneId}`);
			expect(notifications[0]).toContain("pane unavailable");
			expect(statuses).toEqual(expectedStatuses);
		},
	);
});
