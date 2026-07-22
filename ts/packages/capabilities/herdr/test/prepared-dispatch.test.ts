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

		const result = await dispatchPreparedBranch({
			payload,
			destination: { type: "workspace" },
			herdr,
			slotClient: slotClient("/state/slots/repos/ns/worktrees/slot-07"),
			notify: () => {},
		});

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

		const result = await dispatchPreparedBranch({
			payload,
			destination: { type: "workspace" },
			herdr,
			slotClient: slotClient("/ordinary/worktree"),
			notify: () => {},
		});

		expect(result).toMatchObject({
			type: "opened",
			target: { label: "implement-feature" },
		});
		expect(herdr.createWorkspaceCalls[0]?.options.label).toBe("implement-feature");
	});

	test("labels a caller tab with the semantic slug rather than the collision branch", async () => {
		const herdr = new FakeHerdrGateway();

		const result = await dispatchPreparedBranch({
			payload,
			destination: { type: "tab", callerWorkspaceId: "caller-ws" },
			herdr,
			slotClient: slotClient("/ordinary/worktree"),
			notify: () => {},
		});

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

		const result = await dispatchPreparedBranch({
			payload,
			destination: { type: "workspace" },
			herdr,
			slotClient: failingSlotClient,
			notify: (message) => notifications.push(message),
		});

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

			const result = await dispatchPreparedBranch({
				payload,
				destination,
				herdr,
				slotClient: slotClient("/ordinary/worktree"),
				notify: (message) => notifications.push(message),
			});

			expect(result).toMatchObject({ type: "failed", stage: "destination-create" });
			expect(herdr.paneRunCalls).toEqual([]);
			expect(notifications.join("\n")).toContain("unavailable");
		},
	);

	test("preserves destination IDs when pane launch fails", async () => {
		const herdr = new FakeHerdrGateway({
			paneRunResult: { type: "failed", message: "pane unavailable" },
		});

		const result = await dispatchPreparedBranch({
			payload,
			destination: { type: "tab", callerWorkspaceId: "caller-ws" },
			herdr,
			slotClient: slotClient("/ordinary/worktree"),
			notify: () => {},
		});

		expect(result).toMatchObject({
			type: "failed",
			stage: "pane-launch",
			workspaceId: "fake-ws-1",
			tabId: "fake-ws-1:t2",
			paneId: "fake-ws-1:p2",
		});
	});
});
