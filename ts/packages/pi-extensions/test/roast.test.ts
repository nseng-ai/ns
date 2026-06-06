import { describe, expect, test } from "bun:test";

import roastExtension, { parseRoastArgs } from "../src/roast.ts";
import type { ExecResult, ExtensionAPI, ExtensionCommandContext } from "../src/roast.ts";

const ROOT = "/repo";
const ROASTER_TIMEOUT_MS = 30 * 60 * 1000;

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type RoastMessage = Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[0];

interface Notification {
	message: string;
	level: "info" | "warning" | "error" | undefined;
}

interface StatusUpdate {
	key: string;
	value: string | undefined;
}

interface ExecCall {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly messages: RoastMessage[] = [];
	private readonly execResults: ExecResult[];

	constructor(execResults: ExecResult | ExecResult[] = { stdout: "", stderr: "", code: 0 }) {
		this.execResults = Array.isArray(execResults) ? [...execResults] : [execResults];
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		return this.execResults.shift() ?? { stdout: "", stderr: "", code: 0 };
	}

	sendMessage(message: RoastMessage): void {
		this.messages.push(message);
	}
}

function createContext(options: { selectResponse?: string } = {}): {
	ctx: ExtensionCommandContext;
	notifications: Notification[];
	statuses: StatusUpdate[];
	selectOptions: () => string[] | undefined;
	waitForIdleCalls: () => number;
	editorText: () => string | undefined;
} {
	const notifications: Notification[] = [];
	const statuses: StatusUpdate[] = [];
	let waits = 0;
	let restoredEditorText: string | undefined;
	let lastSelectOptions: string[] | undefined;
	const ui: ExtensionCommandContext["ui"] = {
		notify(message, level): void {
			notifications.push({ message, level });
		},
		setStatus(key, value): void {
			statuses.push({ key, value });
		},
		setEditorText(text): void {
			restoredEditorText = text;
		},
	};
	if ("selectResponse" in options) {
		ui.select = async (_title, choices): Promise<string | undefined> => {
			lastSelectOptions = [...choices];
			return options.selectResponse;
		};
	}
	const ctx: ExtensionCommandContext = {
		cwd: ROOT,
		hasUI: true,
		ui,
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, statuses, selectOptions: () => lastSelectOptions, waitForIdleCalls: () => waits, editorText: () => restoredEditorText };
}

function clinkrSuccess(data: unknown): ExecResult {
	return { stdout: JSON.stringify({ exit_code: 0, data }), stderr: "", code: 0 };
}

function clinkrFailure(errorType: string, message: string, code = 2): ExecResult {
	return {
		stdout: JSON.stringify({ exit_code: code, error_type: errorType, message }),
		stderr: `stderr for ${errorType}\n`,
		code,
	};
}

function selectionData(options: {
	selected?: unknown[];
	skipped?: unknown[];
	changedPaths?: string[];
} = {}): unknown {
	const selected = options.selected ?? [selectedReview("dignified-python", { matchedPaths: ["app.py"] })];
	const skipped = options.skipped ?? [];
	const changedPaths = options.changedPaths ?? ["app.py"];
	return {
		base_ref: "master",
		changed_paths: changedPaths,
		changed_path_count: changedPaths.length,
		selected_reviews: selected,
		selected_count: selected.length,
		skipped_reviews: skipped,
		skipped_count: skipped.length,
	};
}

function selectedReview(
	key: string,
	options: { defaultModel?: string | null; patterns?: string[]; matchedPaths?: string[] } = {},
): unknown {
	const defaultModel = "defaultModel" in options ? options.defaultModel : "haiku";
	return {
		key,
		description: `Review ${key}.`,
		default_model: defaultModel,
		when_changed: options.patterns ?? ["**/*.py"],
		matched_paths: options.matchedPaths ?? ["app.py"],
	};
}

function skippedReview(key: string, patterns: string[]): unknown {
	return {
		key,
		description: `Review ${key}.`,
		default_model: "haiku",
		when_changed: patterns,
		reason: "no_changed_path_match",
	};
}

function harnessData(name = "claude-code"): unknown {
	return { harness_name: name };
}

function findingsRunData(reviewName: string, findings: unknown[] = [], usage: unknown = usageData()): unknown {
	return {
		review_name: reviewName,
		review_path: `/repo/reviews/${reviewName}.md`,
		model: "haiku",
		base_ref: "master",
		usage,
		format: "findings",
		findings,
		count: findings.length,
	};
}

function textRunData(reviewName: string, prose: string): unknown {
	return {
		review_name: reviewName,
		review_path: `/repo/reviews/${reviewName}.md`,
		model: "sonnet",
		base_ref: "master",
		usage: null,
		format: "text",
		prose,
	};
}

function finding(): unknown {
	return {
		path: "app.py",
		line: 7,
		severity: "warning",
		summary: "Avoid print in library code",
		details: "Use click.echo() instead.",
	};
}

function usageData(): unknown {
	return {
		input_tokens: 100,
		output_tokens: 50,
		cache_creation_input_tokens: 10,
		cache_read_input_tokens: 5,
		total_cost_usd: 0.0123,
		duration_ms: 1234,
		num_turns: 1,
	};
}

function firstMessageContent(pi: FakePi): string {
	const content = pi.messages[0]?.content;
	if (typeof content !== "string") throw new Error("expected string message content");
	return content;
}

function firstMessageDetails(pi: FakePi): Record<string, unknown> {
	const details = pi.messages[0]?.details;
	if (!isRecord(details)) throw new Error("expected object message details");
	return details;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

describe("roast extension", () => {
	test("registers /roast and orchestrates matching reviewer runs through JSON roaster commands", async () => {
		const pi = new FakePi([
			clinkrSuccess(
				selectionData({
					selected: [selectedReview("dignified-python", { matchedPaths: ["app.py"] })],
					skipped: [skippedReview("typescript-style", ["**/*.ts", "**/*.tsx"])],
				}),
			),
			clinkrSuccess(harnessData()),
			clinkrSuccess(findingsRunData("dignified-python", [finding()])),
		]);
		roastExtension(pi);

		const command = pi.commands.get("roast");
		expect(command?.description).toContain("Choose and run roaster reviewers");
		if (!command) throw new Error("roast command was not registered");

		const context = createContext();
		await command.handler("", context.ctx);

		expect(context.waitForIdleCalls()).toBe(1);
		expect(pi.execCalls).toEqual([
			{
				command: "uv",
				args: ["run", "roaster", "review", "list-matching", "--format", "json"],
				options: { cwd: ROOT, timeout: ROASTER_TIMEOUT_MS },
			},
			{
				command: "uv",
				args: ["run", "roaster", "harness", "show", "--format", "json"],
				options: { cwd: ROOT, timeout: ROASTER_TIMEOUT_MS },
			},
			{
				command: "uv",
				args: [
					"run",
					"roaster",
					"review",
					"run",
					"dignified-python",
					"--review-format",
					"findings",
					"--harness",
					"claude-code",
					"--format",
					"json",
				],
				options: { cwd: ROOT, timeout: ROASTER_TIMEOUT_MS },
			},
		]);
		expect(context.statuses).toEqual([
			{ key: "roast", value: "selecting matching roaster reviews…" },
			{ key: "roast", value: "resolving roaster harness…" },
			{ key: "roast", value: "running 1/1 dignified-python…" },
			{ key: "roast", value: undefined },
		]);
		const content = firstMessageContent(pi);
		expect(content).toContain("Roast summary: base_ref=master");
		expect(content).toContain("Findings: 1");
		expect(content).toContain("- typescript-style (patterns: **/*.ts, **/*.tsx)");
		expect(content).toContain("[warning] app.py:7 Avoid print in library code");
		expect(content).toContain("115 in / 50 out");
		const details = firstMessageDetails(pi);
		expect(details.level).toBe("warning");
		expect(details.exitCode).toBe(0);
	});

	test("threads supported flags to selection, harness, and text review runs", async () => {
		const pi = new FakePi([
			clinkrSuccess(selectionData({ selected: [selectedReview("typescript-style", { defaultModel: "sonnet", patterns: ["**/*.ts"], matchedPaths: ["app.ts"] })], changedPaths: ["app.ts"] })),
			clinkrSuccess(harnessData()),
			clinkrSuccess(textRunData("typescript-style", "### Review\n\nNo issues.")),
		]);
		roastExtension(pi);
		const command = pi.commands.get("roast");
		if (!command) throw new Error("roast command was not registered");

		const context = createContext();
		await command.handler("--base-ref origin/master --harness claude-code --model sonnet --review-format text", context.ctx);

		expect(pi.execCalls[0]?.args).toEqual(["run", "roaster", "review", "list-matching", "--base-ref", "origin/master", "--format", "json"]);
		expect(pi.execCalls[1]?.args).toEqual(["run", "roaster", "harness", "show", "claude-code", "--format", "json"]);
		expect(pi.execCalls[2]?.args).toEqual([
			"run",
			"roaster",
			"review",
			"run",
			"typescript-style",
			"--review-format",
			"text",
			"--harness",
			"claude-code",
			"--base-ref",
			"origin/master",
			"--model",
			"sonnet",
			"--format",
			"json",
		]);
		expect(firstMessageContent(pi)).toContain("### Review");
		expect(firstMessageDetails(pi).level).toBe("info");
	});

	test("reports no matching reviews as an info-level success without harness preflight", async () => {
		const pi = new FakePi([clinkrSuccess(selectionData({ selected: [], skipped: [skippedReview("dignified-python", ["**/*.py"])] }))]);
		roastExtension(pi);
		const command = pi.commands.get("roast");
		if (!command) throw new Error("roast command was not registered");

		const context = createContext();
		await command.handler("", context.ctx);

		expect(pi.execCalls).toHaveLength(1);
		expect(firstMessageContent(pi)).toContain("No matching reviews; no reviewers were run.");
		expect(firstMessageDetails(pi).level).toBe("info");
		expect(firstMessageDetails(pi).exitCode).toBe(0);
	});

	test("prompts with skill-equivalent reviewer options and runs the selected reviewer", async () => {
		const pi = new FakePi([
			clinkrSuccess(
				selectionData({
					selected: [],
					skipped: [
						skippedReview("dignified-python", ["**/*.py"]),
						skippedReview("simplify", ["**/*.py", "**/*.ts"]),
						skippedReview("typescript-style", ["**/*.ts"]),
					],
				}),
			),
			clinkrSuccess(harnessData()),
			clinkrSuccess(findingsRunData("simplify", [])),
		]);
		roastExtension(pi);
		const command = pi.commands.get("roast");
		if (!command) throw new Error("roast command was not registered");

		const context = createContext({ selectResponse: "simplify" });
		await command.handler("", context.ctx);

		expect(context.selectOptions()).toEqual(["dignified-python", "simplify", "typescript-style", "all matching changed files", "all reviews"]);
		expect(pi.execCalls[2]?.args).toEqual([
			"run",
			"roaster",
			"review",
			"run",
			"simplify",
			"--review-format",
			"findings",
			"--harness",
			"claude-code",
			"--format",
			"json",
		]);
		expect(firstMessageContent(pi)).toContain("Roast summary: base_ref=master, changed_paths=1, selected=1, skipped=0");
		expect(firstMessageContent(pi)).toContain("- simplify");
	});

	test("runs explicit reviewer keys without prompting", async () => {
		const pi = new FakePi([
			clinkrSuccess(
				selectionData({
					selected: [],
					skipped: [skippedReview("simplify", ["**/*.py", "**/*.ts"])],
				}),
			),
			clinkrSuccess(harnessData()),
			clinkrSuccess(findingsRunData("simplify", [])),
		]);
		roastExtension(pi);
		const command = pi.commands.get("roast");
		if (!command) throw new Error("roast command was not registered");

		const context = createContext({ selectResponse: "typescript-style" });
		await command.handler("simplify", context.ctx);

		expect(context.selectOptions()).toBeUndefined();
		expect(pi.execCalls[2]?.args).toContain("simplify");
		expect(firstMessageContent(pi)).toContain("selected=1, skipped=0");
	});

	test("fails before reviewer runs when selected reviewers have no model", async () => {
		const pi = new FakePi([
			clinkrSuccess(selectionData({ selected: [selectedReview("missing-model", { defaultModel: null })] })),
			clinkrSuccess(harnessData()),
		]);
		roastExtension(pi);
		const command = pi.commands.get("roast");
		if (!command) throw new Error("roast command was not registered");

		const context = createContext();
		await command.handler("", context.ctx);

		expect(pi.execCalls).toHaveLength(2);
		expect(firstMessageContent(pi)).toContain("missing-model: no model provided");
		expect(firstMessageDetails(pi).level).toBe("error");
		expect(firstMessageDetails(pi).exitCode).toBe(2);
	});

	test("fails before reviewer runs when harness preflight fails", async () => {
		const pi = new FakePi([clinkrSuccess(selectionData()), clinkrFailure("harness_not_configured", "No harness detected")]);
		roastExtension(pi);
		const command = pi.commands.get("roast");
		if (!command) throw new Error("roast command was not registered");

		const context = createContext();
		await command.handler("", context.ctx);

		expect(pi.execCalls).toHaveLength(2);
		const content = firstMessageContent(pi);
		expect(content).toContain("roaster roast exited with code 2");
		expect(content).toContain("harness_not_configured: No harness detected");
		expect(content).toContain("stderr for harness_not_configured");
		expect(firstMessageDetails(pi).level).toBe("error");
	});

	test("continues after per-review hard errors and reports aggregate failure", async () => {
		const pi = new FakePi([
			clinkrSuccess(
				selectionData({
					selected: [selectedReview("first", { matchedPaths: ["one.py"] }), selectedReview("second", { matchedPaths: ["two.py"] })],
				}),
			),
			clinkrSuccess(harnessData()),
			clinkrFailure("claude_code_invalid_json", "Claude Code returned invalid JSON"),
			clinkrSuccess(findingsRunData("second", [])),
		]);
		roastExtension(pi);
		const command = pi.commands.get("roast");
		if (!command) throw new Error("roast command was not registered");

		const context = createContext();
		await command.handler("", context.ctx);

		expect(pi.execCalls).toHaveLength(4);
		const content = firstMessageContent(pi);
		expect(content).toContain("first:");
		expect(content).toContain("claude_code_invalid_json: Claude Code returned invalid JSON");
		expect(content).toContain("- second");
		expect(content).toContain("No findings.");
		expect(firstMessageDetails(pi).level).toBe("error");
		expect(firstMessageDetails(pi).exitCode).toBe(2);
	});

	test("restores the command on tokenization parse errors without running uv", async () => {
		const pi = new FakePi();
		roastExtension(pi);
		const command = pi.commands.get("roast");
		if (!command) throw new Error("roast command was not registered");

		const context = createContext();
		await command.handler("--model 'unterminated", context.ctx);

		expect(context.waitForIdleCalls()).toBe(0);
		expect(pi.execCalls).toEqual([]);
		expect(context.editorText()).toBe("/roast --model 'unterminated");
		expect(context.notifications[0]?.level).toBe("warning");
		expect(firstMessageContent(pi)).toContain("Error: Unterminated single quote.");
	});

	test("shows custom help without waiting for idle or running uv", async () => {
		const pi = new FakePi();
		roastExtension(pi);
		const command = pi.commands.get("roast");
		if (!command) throw new Error("roast command was not registered");

		const context = createContext();
		await command.handler("--help", context.ctx);

		expect(context.waitForIdleCalls()).toBe(0);
		expect(pi.execCalls).toEqual([]);
		expect(firstMessageContent(pi)).toContain("/roast chooses and runs roaster reviewers");
		expect(firstMessageContent(pi)).toContain("--review-format VALUE");
	});
});

describe("parseRoastArgs", () => {
	test("defaults to findings format", () => {
		expect(parseRoastArgs([])).toEqual({ type: "ok", options: { reviewFormat: "findings", reviewKeys: [] } });
	});

	test("accepts explicit reviewer keys", () => {
		expect(parseRoastArgs(["simplify", "typescript-style"])).toEqual({
			type: "ok",
			options: { reviewFormat: "findings", reviewKeys: ["simplify", "typescript-style"] },
		});
	});

	test("rejects unsupported argument forms", () => {
		for (const args of [["--model=haiku"], ["--format", "json"], ["--unknown", "x"], ["-h"], ["--review-format", "markdown"]]) {
			const result = parseRoastArgs(args);
			expect(result.type).toBe("error");
		}
	});
});
