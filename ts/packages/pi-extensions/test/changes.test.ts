import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CommandContext, ExtensionAPI } from "../src/changes.ts";
import { formatOutstandingChangesMessage, summarizePorcelainStatus } from "../src/changes-summary.ts";
import type { PendingWorktreeSnapshot, WorktreeCommandResult } from "asdl-dev/src/pending-worktree.ts";
import { stripTerminalEscapes } from "../src/terminal-presentation.ts";

type ModelResponse = {
	stopReason: string;
	errorMessage?: string;
	content: Array<{ type: string; text?: string }>;
};

const completionState = vi.hoisted<{ nextCompletion: () => Promise<ModelResponse> }>(() => ({
	nextCompletion: async () => ({
		stopReason: "stop",
		content: [{ type: "text", text: "- Touch src/file.ts implementation\n- Add new-file.ts scaffold" }],
	}),
}));

vi.mock("@earendil-works/pi-ai", () => ({
	completeSimple(): Promise<ModelResponse> {
		return completionState.nextCompletion();
	},
}));

const VALID_SUMMARY = "- Touch src/file.ts implementation\n- Add new-file.ts scaffold";

function textResponse(text: string): ModelResponse {
	return { stopReason: "stop", content: [{ type: "text", text }] };
}

const {
	default: changesExtension,
	CHANGES_SUMMARY_MESSAGE_TYPE,
	renderChangesSummaryMessage,
	showOutstandingChanges,
} = await import("../src/changes.ts");
const { validateChangesSummary } = await import("../src/changes-model-summary.ts");

const ROOT = "/repo";
const PREVIOUS_HARNESS = process.env.PI_DRAFT_HARNESS;

beforeEach(() => {
	delete process.env.PI_DRAFT_HARNESS;
	completionState.nextCompletion = async () => textResponse(VALID_SUMMARY);
});

afterEach(() => {
	if (PREVIOUS_HARNESS === undefined) {
		delete process.env.PI_DRAFT_HARNESS;
	} else {
		process.env.PI_DRAFT_HARNESS = PREVIOUS_HARNESS;
	}
});

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type ExecOptions = Parameters<ExtensionAPI["exec"]>[2];
type CustomMessage = Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[0];
type MessageRenderer = Parameters<NonNullable<ExtensionAPI["registerMessageRenderer"]>>[1];

type ExecCall = {
	command: string;
	args: string[];
	options: ExecOptions;
};

type ScriptedExec = {
	command: string;
	args: string[];
	result: Partial<WorktreeCommandResult> | undefined;
};

type Notification = {
	message: string;
	level: "info" | "warning" | "error" | undefined;
};

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly calls: ExecCall[] = [];
	readonly errors: string[] = [];
	readonly messageRenderers = new Map<string, MessageRenderer>();
	readonly sentMessages: CustomMessage[] = [];
	readonly registerMessageRenderer?: (customType: string, renderer: MessageRenderer) => void;
	readonly sendMessage?: (message: CustomMessage) => void;
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[] = [], options: { sendMessage?: boolean; registerMessageRenderer?: boolean } = {}) {
		this.script = [...script];
		if (options.registerMessageRenderer ?? true) {
			this.registerMessageRenderer = (customType, renderer) => {
				this.messageRenderers.set(customType, renderer);
			};
		}
		if (options.sendMessage ?? true) {
			this.sendMessage = (message) => {
				this.sentMessages.push(message);
			};
		}
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<WorktreeCommandResult> {
		this.calls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (expected === undefined) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		return execResult(expected.result);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function execResult(overrides: Partial<WorktreeCommandResult> = {}): WorktreeCommandResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[], result?: Partial<WorktreeCommandResult>): ScriptedExec {
	return { command, args, result };
}

function snapshotSteps(options: { root?: string; branch?: string; status?: string; diff?: string } = {}): ScriptedExec[] {
	return [
		step("git", ["rev-parse", "--show-toplevel"], { stdout: `${options.root ?? ROOT}\n` }),
		step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${options.branch ?? "feature/test"}\n` }),
		step("git", ["status", "--porcelain=v1"], { stdout: options.status ?? " M src/file.ts\n" }),
		step("git", ["diff", "HEAD", "--no-ext-diff"], { stdout: options.diff ?? "diff --git a/src/file.ts b/src/file.ts\n" }),
	];
}

function createContext(options: { findModel?: boolean } = {}): {
	ctx: CommandContext;
	notifications: Notification[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	let waits = 0;
	const ctx: CommandContext = {
		cwd: ROOT,
		modelRegistry: {
			find(): unknown | undefined {
				return (options.findModel ?? true) ? { id: "fake-model" } : undefined;
			},
			async getApiKeyAndHeaders(): Promise<{ ok: true; apiKey: string }> {
				return { ok: true, apiKey: "test-key" };
			},
		},
		ui: {
			notify(message, level): void {
				notifications.push({ message, level });
			},
			setStatus(): void {},
			setWidget(): void {},
			theme: {
				fg(_color, text): string {
					return text;
				},
			},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};
	return { ctx, notifications, waitForIdleCalls: () => waits };
}

function dirtySnapshot(overrides: Partial<PendingWorktreeSnapshot> = {}): PendingWorktreeSnapshot {
	return {
		root: ROOT,
		branch: "feature/test",
		status: " M src/file.ts\n?? new-file.ts\n",
		diff: "diff --git a/src/file.ts b/src/file.ts\n",
		clean: false,
		...overrides,
	};
}

function noopTheme(): { fg(_color: string, text: string): string; bold(text: string): string } {
	return {
		fg(_color, text) {
			return text;
		},
		bold(text) {
			return text;
		},
	};
}

function taggedTheme(): { fg(color: string, text: string): string; bold(text: string): string } {
	return {
		fg(color, text) {
			return `<${color}>${text}</${color}>`;
		},
		bold(text) {
			return `<bold>${text}</bold>`;
		},
	};
}

describe("changes extension registration", () => {
	test("registers the read-only code changes command and renderer", () => {
		const pi = new FakePi();

		changesExtension(pi);

		expect([...pi.commands.keys()]).toEqual(["code:changes"]);
		expect(pi.commands.get("code:changes")?.description).toContain("without committing");
		expect(pi.messageRenderers.has(CHANGES_SUMMARY_MESSAGE_TYPE)).toBe(true);
		expect(pi.messageRenderers.has(["dev", "changes", "summary"].join("-"))).toBe(false);
	});
});

describe("showOutstandingChanges", () => {
	test("reports a clean working tree without sending a transcript message", async () => {
		const pi = new FakePi(snapshotSteps({ status: "", diff: "" }));
		const { ctx, notifications, waitForIdleCalls } = createContext();

		const result = await showOutstandingChanges(pi, ctx);

		expect(result).toBe(true);
		pi.assertDone();
		expect(waitForIdleCalls()).toBe(1);
		expect(notifications).toEqual([{ message: "Working tree is clean; no outstanding changes.", level: "info" }]);
		expect(pi.sentMessages).toEqual([]);
	});

	test("emits a persistent dirty summary with model bullets and raw porcelain status lines", async () => {
		const pi = new FakePi(snapshotSteps({ status: " M src/file.ts\n?? new-file.ts\n" }));
		const { ctx, notifications } = createContext();

		const result = await showOutstandingChanges(pi, ctx);

		expect(result).toBe(true);
		pi.assertDone();
		expect(notifications).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		const message = pi.sentMessages[0];
		expect(message).toBeDefined();
		if (message === undefined) throw new Error("expected dirty summary message");
		expect(message.customType).toBe(CHANGES_SUMMARY_MESSAGE_TYPE);
		expect(message.display).toBe(true);
		expect(message.content).toContain("Outstanding changes on feature/test");
		expect(message.content).toContain("- Touch src/file.ts implementation");
		expect(message.content).toContain("- Add new-file.ts scaffold");
		expect(message.content).toContain("Files:");
		expect(message.content).toContain(" M src/file.ts");
		expect(message.content).toContain("?? new-file.ts");
		expect(message.details).toMatchObject({ root: ROOT, branch: "feature/test" });
		expect((message.details as Record<string, unknown>).source).toBeUndefined();
	});

	test("only runs read-only git inspection commands", async () => {
		const pi = new FakePi(snapshotSteps({ status: " M src/file.ts\n?? new-file.ts\n" }));
		const { ctx } = createContext();

		await showOutstandingChanges(pi, ctx);

		pi.assertDone();
		expect(pi.calls.every((call) => call.command === "git")).toBe(true);
		expect(pi.calls.map((call) => call.args)).toEqual([
			["rev-parse", "--show-toplevel"],
			["symbolic-ref", "--short", "HEAD"],
			["status", "--porcelain=v1"],
			["diff", "HEAD", "--no-ext-diff"],
		]);
		const forbiddenGitSubcommands = new Set(["add", "commit", "stash", "checkout", "switch", "log"]);
		expect(pi.calls.some((call) => forbiddenGitSubcommands.has(call.args[0] ?? ""))).toBe(false);
	});

	test("summarizes dirty work on trunk branches instead of refusing", async () => {
		const pi = new FakePi(snapshotSteps({ branch: "master", status: " M src/file.ts\n" }));
		const { ctx, notifications } = createContext();

		const result = await showOutstandingChanges(pi, ctx);

		expect(result).toBe(true);
		pi.assertDone();
		expect(notifications).toEqual([]);
		expect(pi.sentMessages[0]?.content).toContain("Outstanding changes on master");
		expect(String(pi.sentMessages[0]?.content ?? "")).not.toContain("Refusing");
	});

	test("hard-errors when the model returns invalid output", async () => {
		completionState.nextCompletion = async () => textResponse("This is a prose paragraph, not bullet lines.");
		const pi = new FakePi(snapshotSteps({ status: " M src/file.ts\n" }));
		const { ctx, notifications } = createContext();

		const result = await showOutstandingChanges(pi, ctx);

		expect(result).toBe(false);
		pi.assertDone();
		expect(pi.sentMessages).toEqual([]);
		expect(notifications).toHaveLength(1);
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("invalid changes summary");
	});

	test("hard-errors when the model call throws", async () => {
		completionState.nextCompletion = async () => {
			throw new Error("boom");
		};
		const pi = new FakePi(snapshotSteps({ status: " M src/file.ts\n" }));
		const { ctx, notifications } = createContext();

		const result = await showOutstandingChanges(pi, ctx);

		expect(result).toBe(false);
		pi.assertDone();
		expect(pi.sentMessages).toEqual([]);
		expect(notifications).toHaveLength(1);
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("failed to draft a changes summary");
		expect(notifications[0]?.message).toContain("boom");
	});

	test("hard-errors when the model reports a stop-reason error", async () => {
		completionState.nextCompletion = async () => ({ stopReason: "error", errorMessage: "model exploded", content: [] });
		const pi = new FakePi(snapshotSteps({ status: " M src/file.ts\n" }));
		const { ctx, notifications } = createContext();

		const result = await showOutstandingChanges(pi, ctx);

		expect(result).toBe(false);
		pi.assertDone();
		expect(pi.sentMessages).toEqual([]);
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("failed to draft a changes summary");
		expect(notifications[0]?.message).toContain("model exploded");
	});

	test("hard-errors when the configured model cannot be found", async () => {
		const pi = new FakePi(snapshotSteps({ status: " M src/file.ts\n" }));
		const { ctx, notifications } = createContext({ findModel: false });

		const result = await showOutstandingChanges(pi, ctx);

		expect(result).toBe(false);
		pi.assertDone();
		expect(pi.sentMessages).toEqual([]);
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("Could not find Pi model");
	});

	test("formats snapshot errors with command details", async () => {
		const pi = new FakePi([step("git", ["rev-parse", "--show-toplevel"], { code: 128, stderr: "not a git repository" })]);
		const { ctx, notifications } = createContext();

		const result = await showOutstandingChanges(pi, ctx);

		expect(result).toBe(false);
		pi.assertDone();
		expect(notifications).toEqual([
			{ message: "Not inside a git repository.\nexit 128: not a git repository", level: "error" },
		]);
	});

	test("falls back to a notification when sendMessage is unavailable", async () => {
		const pi = new FakePi(snapshotSteps({ status: " M src/file.ts\n" }), { sendMessage: false });
		const { ctx, notifications } = createContext();

		const result = await showOutstandingChanges(pi, ctx);

		expect(result).toBe(true);
		pi.assertDone();
		expect(pi.sentMessages).toEqual([]);
		expect(notifications).toHaveLength(1);
		expect(notifications[0]?.level).toBe("info");
		expect(notifications[0]?.message).toContain("Outstanding changes on feature/test");
		expect(notifications[0]?.message).toContain("Files:");
	});
});

describe("changes summary helpers", () => {
	test("counts porcelain status categories from both status columns", () => {
		const summary = summarizePorcelainStatus([" M modified.ts", "A  added.ts", " D deleted.ts", "R  old.ts -> new.ts", "C  copied.ts", "?? new.ts", "UU conflict.ts", "!! ignored.ts"].join("\n"));

		expect(summary).toMatchObject({
			modified: 1,
			added: 1,
			deleted: 1,
			renamed: 1,
			copied: 1,
			untracked: 1,
			conflicted: 1,
			other: 1,
		});
		expect(summary.fileLines).toHaveLength(8);
	});

	test("caps long file lists with an omitted-count line", () => {
		const status = Array.from({ length: 52 }, (_value, index) => ` M file-${index}.ts`).join("\n");
		const message = formatOutstandingChangesMessage({
			snapshot: dirtySnapshot({ status }),
			summaryText: "- Many tracked files changed",
		});

		expect(message).toContain(" M file-0.ts");
		expect(message).toContain(" M file-49.ts");
		expect(message).not.toContain(" M file-50.ts");
		expect(message).toContain("... 2 more file(s)");
	});
});

describe("validateChangesSummary", () => {
	test("accepts one to four bullet lines", () => {
		expect(validateChangesSummary("- One change")).toEqual({ ok: true, summaryText: "- One change" });
		expect(validateChangesSummary("- One\n- Two\n- Three\n- Four")).toEqual({
			ok: true,
			summaryText: "- One\n- Two\n- Three\n- Four",
		});
	});

	test("strips an outer code fence around valid bullets", () => {
		expect(validateChangesSummary("```\n- One\n- Two\n```")).toEqual({ ok: true, summaryText: "- One\n- Two" });
	});

	test("rejects empty output", () => {
		expect(validateChangesSummary("   \n  ").ok).toBe(false);
	});

	test("rejects more than four bullets", () => {
		expect(validateChangesSummary("- 1\n- 2\n- 3\n- 4\n- 5").ok).toBe(false);
	});

	test("rejects prose lines", () => {
		expect(validateChangesSummary("This is a summary of changes.").ok).toBe(false);
	});

	test("rejects inner code fences", () => {
		expect(validateChangesSummary("- One change\n```").ok).toBe(false);
	});

	test("rejects checkpoint [cp] markers", () => {
		expect(validateChangesSummary("- [cp] Update files").ok).toBe(false);
	});
});

describe("changes summary renderer", () => {
	test("renders compact copyable lines with theme styling", () => {
		const content = "Outstanding changes on feature/test\n\n- 1 tracked file changed\n\nFiles:\n M src/file.ts\n?? new-file.ts";
		const component = renderChangesSummaryMessage(
			{ customType: CHANGES_SUMMARY_MESSAGE_TYPE, content, display: true },
			{ expanded: false },
			taggedTheme(),
		);

		expect(component.render(120)).toEqual([
			"<accent><bold>Outstanding changes on feature/test</bold></accent>",
			"",
			"- 1 tracked file changed",
			"",
			"<muted>Files:</muted>",
			"<dim> M src/file.ts</dim>",
			"<dim>?? new-file.ts</dim>",
		]);
	});

	test("truncates rendered lines without removing content", () => {
		const component = renderChangesSummaryMessage(
			{ customType: CHANGES_SUMMARY_MESSAGE_TYPE, content: "Outstanding changes on feature/very-long-branch-name", display: true },
			{ expanded: false },
			noopTheme(),
		);

		expect(stripTerminalEscapes(component.render(24).join("\n"))).toBe("Outstanding changes on …");
	});
});
