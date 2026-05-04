import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, test } from "vitest";

import { runObjectiveNext, type NextContextResult } from "../../src/commands/next.ts";

type ExecResult = {
	stdout: string;
	stderr: string;
	code: number;
};

type ExecCall = {
	command: string;
	args: string[];
	options: {
		cwd?: string;
		timeout?: number;
	};
};

type SentMessage = {
	customType: string;
	content: string;
	display: boolean;
	details: Record<string, unknown>;
	options?: { triggerTurn?: boolean };
};

type Harness = {
	pi: ExtensionAPI;
	calls: ExecCall[];
	messages: SentMessage[];
};

const tempDirs: string[] = [];

const SAMPLE_CONTEXT: NextContextResult = {
	current_branch: "feature/widgets",
	trunk_branch: "master",
	on_trunk: false,
	slug: "widget-rewrite",
	files_present: ["body.md", "roadmap.md", "notes.md"],
	freshness: "fresh",
	freshness_advisory: null,
	notes_present: true,
	body_content: "# Widget rewrite\n\nStatus: Open\n\nBody raw content.",
	roadmap_content: "## Phase 1\n\n- [x] Completed setup.\n- [ ] Keep roadmap raw.",
	notes_content: "Durable note raw content.",
};

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function makeCwd(): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), "objective-next-test-"));
	tempDirs.push(path);
	return path;
}

function envelope(data: NextContextResult): string {
	return JSON.stringify({ exit_code: 0, data });
}

function makeHarness(handler: (command: string, args: string[], options: ExecCall["options"]) => Promise<ExecResult>): Harness {
	const calls: ExecCall[] = [];
	const messages: SentMessage[] = [];
	const pi = {
		exec: async (command: string, args: string[], options: ExecCall["options"]) => {
			calls.push({ command, args, options });
			return handler(command, args, options);
		},
		sendMessage: (message: Omit<SentMessage, "options">, options?: SentMessage["options"]) => {
			messages.push(options === undefined ? message : { ...message, options });
		},
		registerCommand: () => {},
	} as unknown as ExtensionAPI;
	return { pi, calls, messages };
}

function makeContext(cwd: string): ExtensionCommandContext {
	return { cwd, hasUI: false } as unknown as ExtensionCommandContext;
}

function latestMessage(harness: Harness): SentMessage {
	const message = harness.messages.at(-1);
	if (!message) {
		throw new Error("Expected a sent message.");
	}
	return message;
}

describe("runObjectiveNext", () => {
	test("no-slug call invokes objective exec next-context --format json only", async () => {
		const cwd = await makeCwd();
		const harness = makeHarness(async () => ({ stdout: envelope(SAMPLE_CONTEXT), stderr: "", code: 0 }));

		await runObjectiveNext(harness.pi, makeContext(cwd), "");

		expect(harness.calls).toEqual([
			{
				command: "objective",
				args: ["exec", "next-context", "--format", "json"],
				options: { cwd, timeout: 30_000 },
			},
		]);
	});

	test("explicit slug is passed before format args", async () => {
		const cwd = await makeCwd();
		const harness = makeHarness(async () => ({ stdout: envelope(SAMPLE_CONTEXT), stderr: "", code: 0 }));

		await runObjectiveNext(harness.pi, makeContext(cwd), "widget-rewrite");

		expect(harness.calls).toHaveLength(1);
		expect(harness.calls[0]?.command).toBe("objective");
		expect(harness.calls[0]?.args).toEqual(["exec", "next-context", "widget-rewrite", "--format", "json"]);
	});

	test("unsupported flags are rejected before invoking the CLI", async () => {
		const cwd = await makeCwd();
		const harness = makeHarness(async () => {
			throw new Error("CLI should not be invoked");
		});

		await runObjectiveNext(harness.pi, makeContext(cwd), "--format json");

		expect(harness.calls).toEqual([]);
		expect(latestMessage(harness).content).toContain("Unsupported flag for /objective-next: --format");
	});

	test("CLI envelope errors are surfaced", async () => {
		const cwd = await makeCwd();
		const stdout = JSON.stringify({
			exit_code: 2,
			error_type: "no_objective_on_branch",
			message: "No objective on branch 'feature/widgets'. Run `objective-claim <slug>` first.",
		});
		const harness = makeHarness(async () => ({ stdout, stderr: "", code: 2 }));

		await runObjectiveNext(harness.pi, makeContext(cwd), "");

		const message = latestMessage(harness);
		expect(message.details.status).toBe("failed");
		expect(message.options?.triggerTurn).toBeUndefined();
		expect(message.content).toContain("objective exec next-context failed: no_objective_on_branch");
		expect(message.content).toContain("No objective on branch");
	});

	test("emitted message includes branch, slug, files, freshness, and raw content", async () => {
		const cwd = await makeCwd();
		const context: NextContextResult = {
			...SAMPLE_CONTEXT,
			freshness: "stale",
			freshness_advisory: "Snapshot is behind HEAD on feature/widgets — consider running objective-update widget-rewrite first.",
		};
		const harness = makeHarness(async () => ({ stdout: envelope(context), stderr: "", code: 0 }));

		await runObjectiveNext(harness.pi, makeContext(cwd), "");

		const message = latestMessage(harness);
		const content = message.content;
		expect(message.options?.triggerTurn).toBe(true);
		expect(content).toContain("# Objective next context: `widget-rewrite`");
		expect(content).toContain("Current branch: `feature/widgets`");
		expect(content).toContain("Trunk branch: `master`");
		expect(content).toContain("Files: body.md, roadmap.md, notes.md");
		expect(content).toContain("Freshness: stale");
		expect(content).toContain("Advisory: Snapshot is behind HEAD");
		expect(content).toContain(SAMPLE_CONTEXT.body_content);
		expect(content).toContain(SAMPLE_CONTEXT.roadmap_content ?? "");
		expect(content).toContain("- [x] Completed setup.");
		expect(content).toContain("- [ ] Keep roadmap raw.");
		expect(content).toContain(SAMPLE_CONTEXT.notes_content ?? "");
		expect(content).toContain("## Agent task");
		expect(content).toContain("Interpret the raw Markdown above yourself");
		expect(content).toContain("objective exec next-collision <candidate-slug> --format json");
		expect(content).not.toContain("Suggested slug");
	});

	test("does not call legacy git, brmem, objective list/show/precheck, or collision operations", async () => {
		const cwd = await makeCwd();
		const harness = makeHarness(async () => ({ stdout: envelope(SAMPLE_CONTEXT), stderr: "", code: 0 }));

		await runObjectiveNext(harness.pi, makeContext(cwd), "");

		const commands = harness.calls.map((call) => [call.command, ...call.args].join(" "));
		expect(commands).toEqual(["objective exec next-context --format json"]);
		expect(commands.some((command) => command.startsWith("git "))).toBe(false);
		expect(commands.some((command) => command.startsWith("brmem "))).toBe(false);
		expect(commands.some((command) => command.includes("objective list"))).toBe(false);
		expect(commands.some((command) => command.includes("objective show"))).toBe(false);
		expect(commands.some((command) => command.includes("update-precheck"))).toBe(false);
		expect(commands.some((command) => command.includes("next-collision"))).toBe(false);
	});
});
