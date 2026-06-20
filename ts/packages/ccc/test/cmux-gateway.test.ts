import { describe, expect, test } from "vitest";

import { ScriptedCommandExecApi } from "@asdl/core/testing";
import type { CommandExecApi, ExecOptions, ExecResult } from "@asdl/core/exec";
import { RealCmuxGateway } from "../src/cmux/gateway.ts";

const CWD = "/repo";

function cmux(results: readonly Partial<ExecResult>[] = []): {
	gateway: RealCmuxGateway;
	commands: ScriptedCommandExecApi;
} {
	const commands = new ScriptedCommandExecApi(results);
	return { gateway: new RealCmuxGateway(commands), commands };
}

describe("RealCmuxGateway", () => {
	test("identifyCaller parses workspace, pane, and optional window", async () => {
		const { gateway, commands } = cmux([
			{
				stdout: JSON.stringify({
					caller: { workspace_id: "workspace-1", pane_id: "pane-1", window_id: "window-1" },
				}),
			},
		]);

		const result = await gateway.identifyCaller({ cwd: CWD });

		expect(result).toEqual({
			type: "success",
			value: { workspaceId: "workspace-1", paneId: "pane-1", windowId: "window-1" },
		});
		expect(commands.calls()).toEqual([
			{
				command: "cmux",
				args: ["identify", "--json", "--id-format", "both"],
				options: { cwd: CWD, timeout: 10_000 },
			},
		]);
	});

	test("identifyCaller returns a parse failure for malformed JSON", async () => {
		const { gateway } = cmux([{ stdout: "not json" }]);

		const result = await gateway.identifyCaller({ cwd: CWD });

		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.failure).toMatchObject({
				operation: "identify-caller",
				parseError:
					"cmux identify did not return a caller workspace and pane; are you running inside cmux?",
			});
			expect(result.failure.commandFailure).toBeUndefined();
		}
	});

	test("createTerminalSurface emits exact args and parses surface_id/workspace_id", async () => {
		const { gateway, commands } = cmux([
			{ stdout: JSON.stringify({ surface_id: "surface-1", workspace_id: "workspace-1" }) },
		]);

		const result = await gateway.createTerminalSurface({
			cwd: CWD,
			caller: { workspaceId: "workspace-1", paneId: "pane-1", windowId: "window-1" },
		});

		expect(result).toEqual({
			type: "success",
			value: { surfaceId: "surface-1", workspaceId: "workspace-1" },
		});
		expect(commands.calls()[0]?.args).toEqual([
			"--json",
			"new-surface",
			"--type",
			"terminal",
			"--workspace",
			"workspace-1",
			"--pane",
			"pane-1",
			"--focus",
			"true",
			"--window",
			"window-1",
		]);
	});

	test("createTerminalSurface accepts surface_ref and workspace_ref", async () => {
		const { gateway } = cmux([
			{ stdout: JSON.stringify({ surface_ref: "surface:1", workspace_ref: "workspace:1" }) },
		]);

		const result = await gateway.createTerminalSurface({
			cwd: CWD,
			caller: { workspaceId: "workspace-1", paneId: "pane-1" },
		});

		expect(result).toEqual({
			type: "success",
			value: { surfaceId: "surface:1", workspaceId: "workspace:1" },
		});
	});

	test("renameTab includes --window only when a window id exists", async () => {
		const { gateway, commands } = cmux([{}, {}]);

		await gateway.renameTab({
			cwd: CWD,
			workspaceId: "workspace-1",
			surfaceId: "surface-1",
			windowId: "window-1",
			title: "First",
		});
		await gateway.renameTab({
			cwd: CWD,
			workspaceId: "workspace-1",
			surfaceId: "surface-1",
			title: "Second",
		});

		expect(commands.calls().map((call) => call.args)).toEqual([
			[
				"rename-tab",
				"--workspace",
				"workspace-1",
				"--surface",
				"surface-1",
				"--title",
				"First",
				"--window",
				"window-1",
			],
			["rename-tab", "--workspace", "workspace-1", "--surface", "surface-1", "--title", "Second"],
		]);
	});

	test("sendText appends -- and preserves exact text", async () => {
		const { gateway, commands } = cmux([{}]);

		await gateway.sendText({
			cwd: CWD,
			workspaceId: "workspace-1",
			surfaceId: "surface-1",
			windowId: "window-1",
			text: "run me\n",
		});

		expect(commands.calls()[0]?.args).toEqual([
			"send",
			"--workspace",
			"workspace-1",
			"--surface",
			"surface-1",
			"--window",
			"window-1",
			"--",
			"run me\n",
		]);
	});

	test("openWorkspace includes optional --command only when supplied", async () => {
		const { gateway, commands } = cmux([{}, {}]);

		await gateway.openWorkspace({
			cwd: CWD,
			name: "branch-a",
			description: "description-a",
			workspaceCwd: "/worktree-a",
			command: "pi '/branch-context:impl'",
		});
		await gateway.openWorkspace({
			cwd: CWD,
			name: "branch-b",
			description: "description-b",
			workspaceCwd: "/worktree-b",
		});

		expect(commands.calls().map((call) => call.args)).toEqual([
			[
				"new-workspace",
				"--name",
				"branch-a",
				"--description",
				"description-a",
				"--cwd",
				"/worktree-a",
				"--command",
				"pi '/branch-context:impl'",
			],
			[
				"new-workspace",
				"--name",
				"branch-b",
				"--description",
				"description-b",
				"--cwd",
				"/worktree-b",
			],
		]);
	});

	test("workspace summary operations emit exact args", async () => {
		const { gateway, commands } = cmux([{}, {}, {}]);

		await gateway.renameWorkspace({ cwd: CWD, workspace: "workspace-1", title: "Summary" });
		await gateway.setWorkspaceDescription({
			cwd: CWD,
			workspace: "workspace-1",
			description: "Goal: ship",
		});
		await gateway.clearStatus({ cwd: CWD, workspace: "workspace-1", statusKey: "pi-summary" });

		expect(commands.calls().map((call) => call.args)).toEqual([
			["workspace", "rename", "workspace-1", "--title", "Summary"],
			[
				"workspace-action",
				"--workspace",
				"workspace-1",
				"--action",
				"set-description",
				"--description",
				"Goal: ship",
			],
			["clear-status", "pi-summary", "--workspace", "workspace-1"],
		]);
	});

	test("nonzero and killed command results return command failures", async () => {
		const { gateway } = cmux([{ code: 124, killed: true, stderr: "timed out" }]);

		const result = await gateway.sendText({
			cwd: CWD,
			workspaceId: "workspace-1",
			surfaceId: "surface-1",
			text: "hello",
		});

		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.failure.operation).toBe("send-text");
			expect(result.failure.commandFailure?.isKilled).toBe(true);
			expect(result.failure.commandFailure?.exitCode).toBe(124);
		}
	});

	test("startup failure from CommandExecApi.exec is converted to command failure", async () => {
		const commands = new ThrowingCommandExecApi(new Error("spawn ENOENT"));
		const gateway = new RealCmuxGateway(commands);

		const result = await gateway.identifyCaller({ cwd: CWD });

		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.failure.operation).toBe("identify-caller");
			expect(result.failure.commandFailure?.startupError).toContain("spawn ENOENT");
			expect(result.failure.commandFailure?.command).toEqual([
				"cmux",
				"identify",
				"--json",
				"--id-format",
				"both",
			]);
		}
	});
});

class ThrowingCommandExecApi implements CommandExecApi {
	private readonly error: unknown;

	constructor(error: unknown) {
		this.error = error;
	}

	async exec(_command: string, _args: string[], _options?: ExecOptions): Promise<ExecResult> {
		throw this.error;
	}
}
