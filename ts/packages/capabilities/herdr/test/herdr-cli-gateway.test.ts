/**
 * Real-adapter tests for createCliHerdrGateway.
 *
 * These tests pin exact argv sequences and verify JSON response parsing using a
 * scripted FakePi (low-level exec). They do NOT exercise any Pi command logic —
 * only the CLI gateway layer.
 */
import { describe, expect, test } from "vitest";

import { createCliHerdrGateway } from "../src/core/cli-gateway.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import { FakePi, execResult, step } from "./herdr-test-harness.ts";

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
// reportPaneTitle — exact argv
// ---------------------------------------------------------------------------

describe("createCliHerdrGateway.reportPaneTitle", () => {
	test("reports a caller-pane title with stable Objective sidebar ownership", async () => {
		const pi = new FakePi({
			script: [
				step(
					"herdr",
					[
						"pane",
						"report-metadata",
						"w1:p1",
						"--source",
						"ns-objective-sidebar",
						"--title",
						"slot-01",
					],
					{},
				),
			],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.reportPaneTitle("w1:p1", "slot-01");

		pi.assertDone();
		expect(result).toEqual({ type: "applied" });
	});

	test("returns a failure when metadata reporting fails", async () => {
		const pi = new FakePi({
			script: [
				step(
					"herdr",
					[
						"pane",
						"report-metadata",
						"w1:p1",
						"--source",
						"ns-objective-sidebar",
						"--title",
						"slot-01",
					],
					{ code: 1, stderr: "pane not found" },
				),
			],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.reportPaneTitle("w1:p1", "slot-01");

		pi.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") expect(result.message).toContain("pane not found");
	});
});

// ---------------------------------------------------------------------------
// createWorkspace — exact argv
// ---------------------------------------------------------------------------

describe("createCliHerdrGateway.createWorkspace", () => {
	test("happy path: emits --no-focus --cwd --label and parses workspace_id, pane_id, tab_id", async () => {
		const pi = new FakePi({
			script: [
				step(
					"herdr",
					["workspace", "create", "--no-focus", "--cwd", "/repo", "--label", "my-label"],
					{ stdout: WORKSPACE_CREATE_RESPONSE },
				),
			],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.createWorkspace({ cwd: "/repo", label: "my-label" });

		pi.assertDone();
		expect(result).toEqual({
			type: "created",
			workspaceId: "ws-abc123",
			rootPaneId: "p-abc123",
			tabId: "t-abc123",
		});
	});

	test("happy path: omits --label when not provided", async () => {
		const pi = new FakePi({
			script: [
				step("herdr", ["workspace", "create", "--no-focus", "--cwd", "/repo"], {
					stdout: WORKSPACE_CREATE_RESPONSE,
				}),
			],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.createWorkspace({ cwd: "/repo" });

		pi.assertDone();
		expect(result.type).toBe("created");
	});

	test("malformed JSON stdout returns failed", async () => {
		const pi = new FakePi({
			script: [
				step("herdr", ["workspace", "create", "--no-focus", "--cwd", "/repo"], {
					stdout: "not-json{{",
				}),
			],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.createWorkspace({ cwd: "/repo" });

		pi.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("unparseable JSON");
		}
	});

	test("missing workspace_id returns failed with shape message", async () => {
		const pi = new FakePi({
			script: [
				step("herdr", ["workspace", "create", "--no-focus", "--cwd", "/repo"], {
					stdout: JSON.stringify({
						result: { workspace: {}, root_pane: { pane_id: "p-1" }, tab: { tab_id: "t-1" } },
					}),
				}),
			],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.createWorkspace({ cwd: "/repo" });

		pi.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("workspace_id");
		}
	});

	test("non-zero exit returns failed with command display", async () => {
		const pi = new FakePi({
			script: [
				step("herdr", ["workspace", "create", "--no-focus", "--cwd", "/repo"], {
					code: 1,
					stderr: "daemon not running",
				}),
			],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.createWorkspace({ cwd: "/repo" });

		pi.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("daemon not running");
		}
	});

	test("response missing result field returns failed", async () => {
		const pi = new FakePi({
			script: [
				step("herdr", ["workspace", "create", "--no-focus", "--cwd", "/repo"], {
					stdout: JSON.stringify({ status: "ok" }),
				}),
			],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.createWorkspace({ cwd: "/repo" });

		pi.assertDone();
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
	test("focus:true emits --focus; parses tab_id, pane_id, workspace_id", async () => {
		const pi = new FakePi({
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
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.createTab({
			workspaceId: "ws-abc123",
			cwd: "/wt",
			label: "my-tab",
			focus: true,
		});

		pi.assertDone();
		expect(result).toEqual({
			type: "created",
			tabId: "t-tab456",
			rootPaneId: "p-tab456",
			workspaceId: "ws-abc123",
		});
	});

	test("focus:false (default) emits --no-focus", async () => {
		const pi = new FakePi({
			script: [
				step("herdr", ["tab", "create", "--workspace", "ws-abc123", "--no-focus", "--cwd", "/wt"], {
					stdout: TAB_CREATE_RESPONSE,
				}),
			],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.createTab({ workspaceId: "ws-abc123", cwd: "/wt" });

		pi.assertDone();
		expect(result.type).toBe("created");
	});

	test("omits --cwd and --label when not provided", async () => {
		const pi = new FakePi({
			script: [
				step("herdr", ["tab", "create", "--workspace", "ws-abc123", "--no-focus"], {
					stdout: TAB_CREATE_RESPONSE,
				}),
			],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.createTab({ workspaceId: "ws-abc123" });

		pi.assertDone();
		expect(result.type).toBe("created");
	});

	test("malformed JSON returns failed with unparseable message", async () => {
		const pi = new FakePi({
			script: [
				step("herdr", ["tab", "create", "--workspace", "ws-abc123", "--focus"], {
					stdout: "{bad json",
				}),
			],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.createTab({ workspaceId: "ws-abc123", focus: true });

		pi.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("unparseable JSON");
		}
	});

	test("missing tab_id returns failed with shape message", async () => {
		const pi = new FakePi({
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
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.createTab({ workspaceId: "ws-abc123" });

		pi.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("tab_id");
		}
	});

	test("non-zero exit returns failed", async () => {
		const pi = new FakePi({
			script: [
				step("herdr", ["tab", "create", "--workspace", "ws-abc123", "--focus"], {
					code: 1,
					stderr: "workspace not found",
				}),
			],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.createTab({ workspaceId: "ws-abc123", focus: true });

		pi.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("workspace not found");
		}
	});
});

// ---------------------------------------------------------------------------
// runInPane — exact argv
// ---------------------------------------------------------------------------

describe("createCliHerdrGateway.runInPane", () => {
	test("happy path: emits herdr pane run <paneId> <command>", async () => {
		const pi = new FakePi({
			script: [step("herdr", ["pane", "run", "p-abc123", "echo hello"], {})],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.runInPane("p-abc123", "echo hello");

		pi.assertDone();
		expect(result).toEqual({ type: "ok" });
	});

	test("non-zero exit returns failed with stderr", async () => {
		const pi = new FakePi({
			script: [
				step("herdr", ["pane", "run", "p-abc123", "bad-cmd"], {
					code: 1,
					stderr: "pane not found",
				}),
			],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.runInPane("p-abc123", "bad-cmd");

		pi.assertDone();
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("pane not found");
		}
	});

	test("command with special characters is passed as a single argv item", async () => {
		const complexCmd = 'payload="$(brmem get prompt.md)" && pi exec pi "$payload"';
		const pi = new FakePi({
			script: [step("herdr", ["pane", "run", "p-1", complexCmd], {})],
		});
		const herdr = createCliHerdrGateway(createHerdrPiCommandApi(pi));

		const result = await herdr.runInPane("p-1", complexCmd);

		pi.assertDone();
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
