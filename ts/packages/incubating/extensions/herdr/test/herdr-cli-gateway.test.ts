/**
 * Real-adapter tests for createCliHerdrGateway.
 *
 * These tests pin exact argv sequences and verify JSON response parsing through
 * the gateway's narrow command execution seam.
 */
import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/command";
import { createCliHerdrGateway } from "@nseng-ai/herdr/api";

interface ScriptedExec {
	readonly command: string;
	readonly args: string[];
	readonly result?: Partial<Extract<ExecResult, { type: "exited" }>>;
	readonly error?: Error;
}

class ScriptedCommandExec implements CommandExecApi {
	readonly calls: Array<{ command: string; args: string[]; options: ExecOptions | undefined }> = [];
	private readonly script: ScriptedExec[];

	constructor(options: { script: ScriptedExec[] }) {
		this.script = [...options.script];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.calls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (expected === undefined) throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
		expect({ command, args }).toEqual({ command: expected.command, args: expected.args });
		if (expected.error !== undefined) throw expected.error;
		return execResult(expected.result);
	}

	assertDone(): void {
		expect(this.script).toEqual([]);
	}
}

function execResult(
	overrides: Partial<Extract<ExecResult, { type: "exited" }>> = {},
): Extract<ExecResult, { type: "exited" }> {
	return {
		type: "exited",
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		signal: overrides.signal ?? null,
	};
}

function step(
	command: string,
	args: string[],
	result: Partial<Extract<ExecResult, { type: "exited" }>> = {},
): ScriptedExec {
	return { command, args, result };
}

// ---------------------------------------------------------------------------
// Shared JSON response fixtures
// ---------------------------------------------------------------------------

const WORKSPACE_CREATE_RESPONSE = JSON.stringify({
	result: {
		workspace: { workspace_id: "ws-abc123" },
		root_pane: { pane_id: "p-abc123" },
		tab: { tab_id: "t-abc123" },
	},
});

const TAB_CREATE_RESPONSE = JSON.stringify({
	result: {
		tab: { tab_id: "t-tab456", workspace_id: "ws-abc123" },
		root_pane: { pane_id: "p-tab456" },
	},
});

// ---------------------------------------------------------------------------
// createWorkspace — exact argv
// ---------------------------------------------------------------------------

describe("createCliHerdrGateway.createWorkspace", () => {
	test("happy path: emits --no-focus --cwd --label and parses workspace_id, pane_id, tab_id", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step(
					"herdr",
					["workspace", "create", "--no-focus", "--cwd", "/repo", "--label", "my-label"],
					{ stdout: WORKSPACE_CREATE_RESPONSE },
				),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.createWorkspace({ cwd: "/repo", label: "my-label" });

		commands.assertDone();
		expect(result).toEqual({
			type: "created",
			workspaceId: "ws-abc123",
			rootPaneId: "p-abc123",
			tabId: "t-abc123",
		});
	});

	test("shouldFocus:true omits --no-focus", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["workspace", "create", "--cwd", "/repo"], {
					stdout: WORKSPACE_CREATE_RESPONSE,
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.createWorkspace({ cwd: "/repo", shouldFocus: true });

		commands.assertDone();
		expect(result.type).toBe("created");
	});

	test("happy path: omits --label when not provided", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["workspace", "create", "--no-focus", "--cwd", "/repo"], {
					stdout: WORKSPACE_CREATE_RESPONSE,
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.createWorkspace({ cwd: "/repo" });

		commands.assertDone();
		expect(result.type).toBe("created");
	});

	test("malformed JSON stdout returns failed", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["workspace", "create", "--no-focus", "--cwd", "/repo"], {
					stdout: "not-json{{",
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.createWorkspace({ cwd: "/repo" });

		commands.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("unparseable JSON");
		}
	});

	test("missing workspace_id returns failed with shape message", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["workspace", "create", "--no-focus", "--cwd", "/repo"], {
					stdout: JSON.stringify({
						result: { workspace: {}, root_pane: { pane_id: "p-1" }, tab: { tab_id: "t-1" } },
					}),
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.createWorkspace({ cwd: "/repo" });

		commands.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("workspace_id");
		}
	});

	test("non-zero exit returns failed with command display", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["workspace", "create", "--no-focus", "--cwd", "/repo"], {
					code: 1,
					stderr: "daemon not running",
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.createWorkspace({ cwd: "/repo" });

		commands.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("daemon not running");
		}
	});

	test("response missing result field returns failed", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["workspace", "create", "--no-focus", "--cwd", "/repo"], {
					stdout: JSON.stringify({ status: "ok" }),
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.createWorkspace({ cwd: "/repo" });

		commands.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain('"result" field');
		}
	});
});

// ---------------------------------------------------------------------------
// createTab — exact argv with --focus / --no-focus
// ---------------------------------------------------------------------------

describe("createCliHerdrGateway.createTab", () => {
	test("shouldFocus:true emits --focus; parses tab_id, pane_id, workspace_id", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step(
					"herdr",
					[
						"tab",
						"create",
						"--workspace",
						"ws-abc123",
						"--focus",
						"--cwd",
						"/wt",
						"--label",
						"my-tab",
					],
					{ stdout: TAB_CREATE_RESPONSE },
				),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.createTab({
			workspaceId: "ws-abc123",
			cwd: "/wt",
			label: "my-tab",
			shouldFocus: true,
		});

		commands.assertDone();
		expect(result).toEqual({
			type: "created",
			tabId: "t-tab456",
			rootPaneId: "p-tab456",
			workspaceId: "ws-abc123",
		});
	});

	test("shouldFocus:false (default) emits --no-focus", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["tab", "create", "--workspace", "ws-abc123", "--no-focus", "--cwd", "/wt"], {
					stdout: TAB_CREATE_RESPONSE,
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.createTab({ workspaceId: "ws-abc123", cwd: "/wt" });

		commands.assertDone();
		expect(result.type).toBe("created");
	});

	test("omits --cwd and --label when not provided", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["tab", "create", "--workspace", "ws-abc123", "--no-focus"], {
					stdout: TAB_CREATE_RESPONSE,
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.createTab({ workspaceId: "ws-abc123" });

		commands.assertDone();
		expect(result.type).toBe("created");
	});

	test("malformed JSON returns failed with unparseable message", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["tab", "create", "--workspace", "ws-abc123", "--focus"], {
					stdout: "{bad json",
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.createTab({ workspaceId: "ws-abc123", shouldFocus: true });

		commands.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("unparseable JSON");
		}
	});

	test("missing tab_id returns failed with shape message", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["tab", "create", "--workspace", "ws-abc123", "--no-focus"], {
					stdout: JSON.stringify({
						result: {
							tab: { workspace_id: "ws-abc123" }, // no tab_id
							root_pane: { pane_id: "p-1" },
						},
					}),
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.createTab({ workspaceId: "ws-abc123" });

		commands.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("tab_id");
		}
	});

	test("non-zero exit returns failed", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["tab", "create", "--workspace", "ws-abc123", "--focus"], {
					code: 1,
					stderr: "workspace not found",
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.createTab({ workspaceId: "ws-abc123", shouldFocus: true });

		commands.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("workspace not found");
		}
	});
});

// ---------------------------------------------------------------------------
// renameTab — exact argv and bounded diagnostics
// ---------------------------------------------------------------------------

describe("createCliHerdrGateway.renameWorkspace", () => {
	test("uses generic workspace rename diagnostics on non-zero exit", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["workspace", "rename", "w-1", "goal"], {
					code: 3,
					stderr: "workspace missing",
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.renameWorkspace("w-1", "goal");
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("Could not rename Herdr workspace.");
			expect(result.message).not.toContain("Objective");
		}
		commands.assertDone();
	});
});

describe("createCliHerdrGateway.renameTab", () => {
	test("emits herdr tab rename <id> <label>", async () => {
		const commands = new ScriptedCommandExec({
			script: [step("herdr", ["tab", "rename", "t-1", "s3:add-auth"], {})],
		});
		const herdr = createCliHerdrGateway(commands);

		expect(await herdr.renameTab("t-1", "s3:add-auth")).toEqual({ type: "applied" });
		commands.assertDone();
	});

	test("returns bounded diagnostics with non-zero stderr", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["tab", "rename", "t-1", "label"], {
					code: 7,
					stderr: "rename failed\n".repeat(10_000),
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.renameTab("t-1", "label");
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message.length).toBeLessThanOrEqual(4_000);
			expect(result.message).toContain("rename failed");
		}
		commands.assertDone();
	});

	test("bounds thrown-command diagnostics", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				{
					command: "herdr",
					args: ["tab", "rename", "t-1", "label"],
					error: new Error("failure\n".repeat(10_000)),
				},
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.renameTab("t-1", "label");
		expect(result.type).toBe("failed");
		if (result.type === "failed") expect(result.message.length).toBeLessThanOrEqual(4_000);
		commands.assertDone();
	});
});

// ---------------------------------------------------------------------------
// resolveCallerPane — exact argv and caller-aware envelope parsing
// ---------------------------------------------------------------------------

// Observed response from the installed Herdr CLI for `herdr pane current
// --current` executed inside a managed pane (extra pane fields elided are
// retained here to pin real-envelope tolerance).
const PANE_CURRENT_RESPONSE = JSON.stringify({
	id: "cli:pane:current",
	result: {
		pane: {
			agent: "pi",
			agent_status: "working",
			cwd: "/repo",
			focused: false,
			foreground_cwd: "/repo",
			pane_id: "w7S:p1",
			revision: 0,
			scroll: { max_offset_from_bottom: 202, offset_from_bottom: 0, viewport_rows: 46 },
			tab_id: "w7S:t1",
			terminal_id: "term_65807bef46365f4",
			workspace_id: "w7S",
		},
		type: "pane_current",
	},
});

describe("createCliHerdrGateway.resolveCallerPane", () => {
	test("emits exactly `pane current --current` and returns complete caller identity", async () => {
		const commands = new ScriptedCommandExec({
			script: [step("herdr", ["pane", "current", "--current"], { stdout: PANE_CURRENT_RESPONSE })],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.resolveCallerPane();

		commands.assertDone();
		expect(result).toEqual({
			type: "resolved",
			workspaceId: "w7S",
			tabId: "w7S:t1",
			paneId: "w7S:p1",
		});
	});

	test("non-zero exit returns failed with command display and stderr", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["pane", "current", "--current"], {
					code: 1,
					stderr: "no current pane",
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.resolveCallerPane();

		commands.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("Could not resolve the Herdr caller pane.");
			expect(result.message).toContain("no current pane");
		}
	});

	test("malformed JSON returns failed with unparseable message", async () => {
		const commands = new ScriptedCommandExec({
			script: [step("herdr", ["pane", "current", "--current"], { stdout: "{not json" })],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.resolveCallerPane();

		commands.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") expect(result.message).toContain("unparseable JSON");
	});

	test.each([
		["missing pane object", { type: "pane_current" }],
		["missing workspace_id", { pane: { tab_id: "w1:t1", pane_id: "w1:p1" }, type: "pane_current" }],
		["missing tab_id", { pane: { workspace_id: "w1", pane_id: "w1:p1" }, type: "pane_current" }],
		["missing pane_id", { pane: { workspace_id: "w1", tab_id: "w1:t1" }, type: "pane_current" }],
		[
			"blank workspace_id",
			{ pane: { workspace_id: "", tab_id: "w1:t1", pane_id: "w1:p1" }, type: "pane_current" },
		],
		[
			"blank tab_id",
			{ pane: { workspace_id: "w1", tab_id: "", pane_id: "w1:p1" }, type: "pane_current" },
		],
		[
			"blank pane_id",
			{ pane: { workspace_id: "w1", tab_id: "w1:t1", pane_id: "" }, type: "pane_current" },
		],
		["non-string IDs", { pane: { workspace_id: 7, tab_id: 8, pane_id: 9 }, type: "pane_current" }],
	])("%s returns failed with shape message", async (_name, result) => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["pane", "current", "--current"], {
					stdout: JSON.stringify({ result }),
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const resolved = await herdr.resolveCallerPane();

		commands.assertDone();
		expect(resolved.type).toBe("failed");
		if (resolved.type === "failed") {
			expect(resolved.message).toContain("unexpected response shape");
			expect(resolved.message).toContain("missing workspace_id, tab_id, or pane_id");
		}
	});

	test("bounds thrown-command diagnostics", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				{
					command: "herdr",
					args: ["pane", "current", "--current"],
					error: new Error("failure\n".repeat(10_000)),
				},
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.resolveCallerPane();
		expect(result.type).toBe("failed");
		if (result.type === "failed") expect(result.message.length).toBeLessThanOrEqual(4_000);
		commands.assertDone();
	});
});

// ---------------------------------------------------------------------------
// runInPane — exact argv
// ---------------------------------------------------------------------------

describe("createCliHerdrGateway.runInPane", () => {
	test("happy path: emits herdr pane run <paneId> <command>", async () => {
		const commands = new ScriptedCommandExec({
			script: [step("herdr", ["pane", "run", "p-abc123", "echo hello"], {})],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.runInPane("p-abc123", "echo hello");

		commands.assertDone();
		expect(result).toEqual({ type: "ok" });
	});

	test("non-zero exit returns failed with stderr", async () => {
		const commands = new ScriptedCommandExec({
			script: [
				step("herdr", ["pane", "run", "p-abc123", "bad-cmd"], {
					code: 1,
					stderr: "pane not found",
				}),
			],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.runInPane("p-abc123", "bad-cmd");

		commands.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("pane not found");
		}
	});

	test("command with special characters is passed as a single argv item", async () => {
		const complexCmd = 'payload="$(brmem get prompt.md)" && pi exec pi "$payload"';
		const commands = new ScriptedCommandExec({
			script: [step("herdr", ["pane", "run", "p-1", complexCmd], {})],
		});
		const herdr = createCliHerdrGateway(commands);

		const result = await herdr.runInPane("p-1", complexCmd);

		commands.assertDone();
		expect(result.type).toBe("ok");
	});
});

// ---------------------------------------------------------------------------
// execResult re-export sanity (confirms harness is usable standalone)
// ---------------------------------------------------------------------------

describe("execResult fixture helper", () => {
	test("defaults to exit code 0", () => {
		const r = execResult();
		expect(r.code).toBe(0);
		expect(r.stdout).toBe("");
		expect(r.stderr).toBe("");
	});
});
