import { describe, expect, mock, test } from "bun:test";

import type { CommandResult } from "../src/checkpoint-flow.ts";
import type { ExtensionAPI, ExtensionCommandContext } from "../src/checkpoint-pi.ts";
import { stripTerminalEscapes } from "../src/terminal-presentation.ts";

mock.module("@earendil-works/pi-ai", () => ({
	async completeSimple(): Promise<never> {
		throw new Error("unexpected model call from checkpoint-pi tests");
	},
}));

const { prepareCheckpointMessageForPi } = await import("../src/checkpoint-pi.ts");

const HARNESS_ENV = "PI_DRAFT_HARNESS";
const ROOT = "/repo";
const VALID_CHECKPOINT_MESSAGE = `[cp] Update widget progress

- Render checkpoint spinner above editor`;
const DIRTY_SNAPSHOT = {
	status: " M ts/packages/pi-extensions/src/checkpoint-pi.ts\n",
	diff: "diff --git a/ts/packages/pi-extensions/src/checkpoint-pi.ts b/ts/packages/pi-extensions/src/checkpoint-pi.ts\n",
};

type ExecOptions = Parameters<ExtensionAPI["exec"]>[2];
type WidgetContent = Parameters<NonNullable<ExtensionCommandContext["ui"]["setWidget"]>>[1];
type WidgetOptions = Parameters<NonNullable<ExtensionCommandContext["ui"]["setWidget"]>>[2];

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions;
}

interface StatusUpdate {
	key: string;
	value: string | undefined;
}

interface WidgetUpdate {
	key: string;
	value: WidgetContent;
	options: WidgetOptions;
}

interface Notification {
	message: string;
	level: "info" | "warning" | "error" | undefined;
}

class FakePi implements ExtensionAPI {
	readonly calls: ExecCall[] = [];
	private readonly result: CommandResult;

	constructor(result: CommandResult) {
		this.result = result;
	}

	registerCommand(): void {}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<CommandResult> {
		this.calls.push({ command, args, options });
		return this.result;
	}
}

function createContext(options: { widgetApi?: boolean } = {}): {
	ctx: ExtensionCommandContext;
	notifications: Notification[];
	statuses: StatusUpdate[];
	widgets: WidgetUpdate[];
} {
	const notifications: Notification[] = [];
	const statuses: StatusUpdate[] = [];
	const widgets: WidgetUpdate[] = [];
	const ui: ExtensionCommandContext["ui"] = {
		notify(message, level): void {
			notifications.push({ message, level });
		},
		setStatus(key, value): void {
			statuses.push({ key, value });
		},
		theme: {
			fg(_color, text): string {
				return `\x1B[35m${text}\x1B[0m`;
			},
		},
	};

	if (options.widgetApi ?? true) {
		ui.setWidget = (key, value, widgetOptions): void => {
			widgets.push({ key, value, options: widgetOptions });
		};
	}

	return {
		ctx: {
			cwd: ROOT,
			modelRegistry: {
				find(): unknown | undefined {
					return undefined;
				},
				async getApiKeyAndHeaders(): Promise<{ ok: false; error: string }> {
					return { ok: false, error: "unexpected model access" };
				},
			},
			ui,
			async waitForIdle(): Promise<void> {},
		},
		notifications,
		statuses,
		widgets,
	};
}

function successResult(stdout = VALID_CHECKPOINT_MESSAGE): CommandResult {
	return { code: 0, stdout, stderr: "" };
}

function failureResult(stderr = "claude failed"): CommandResult {
	return { code: 2, stdout: "", stderr };
}

async function withClaudeCliHarness(run: () => Promise<void>): Promise<void> {
	const previous = process.env[HARNESS_ENV];
	process.env[HARNESS_ENV] = "claude-cli";
	try {
		await run();
	} finally {
		if (previous === undefined) {
			delete process.env[HARNESS_ENV];
		} else {
			process.env[HARNESS_ENV] = previous;
		}
	}
}

function renderWidget(update: WidgetUpdate, width = 100): string {
	expect(typeof update.value).toBe("function");
	if (typeof update.value !== "function") return "";

	const component = update.value({}, { fg: (_color, text) => `\x1B[36m${text}\x1B[0m` });
	return stripTerminalEscapes(component.render(width).join("\n"));
}

describe("prepareCheckpointMessageForPi progress rendering", () => {
	test("uses an above-editor widget when available", async () => {
		await withClaudeCliHarness(async () => {
			const pi = new FakePi(successResult());
			const { ctx, statuses, widgets } = createContext();

			const result = await prepareCheckpointMessageForPi(pi, ctx, DIRTY_SNAPSHOT);

			expect(result).toEqual({ ok: true, message: VALID_CHECKPOINT_MESSAGE, source: "model" });
			expect(pi.calls).toHaveLength(1);
			expect(pi.calls[0]?.command).toBe("bash");
			const progressWidgets = widgets.filter((widget) => widget.key === "cp" && widget.value !== undefined);
			expect(progressWidgets.length).toBeGreaterThan(0);
			expect(progressWidgets.every((widget) => widget.options?.placement === "aboveEditor")).toBe(true);
			expect(renderWidget(progressWidgets[0]!)).toContain("Drafting checkpoint message with Claude CLI…");
			expect(widgets.at(-1)).toEqual({ key: "cp", value: undefined, options: undefined });
			expect(statuses.filter((status) => status.value !== undefined)).toEqual([]);
			expect(statuses.some((status) => status.key === "cp" && status.value === undefined)).toBe(true);
		});
	});

	test("falls back to status when widget API is unavailable", async () => {
		await withClaudeCliHarness(async () => {
			const pi = new FakePi(successResult());
			const { ctx, statuses, widgets } = createContext({ widgetApi: false });

			const result = await prepareCheckpointMessageForPi(pi, ctx, DIRTY_SNAPSHOT);

			expect(result).toEqual({ ok: true, message: VALID_CHECKPOINT_MESSAGE, source: "model" });
			expect(widgets).toEqual([]);
			const progressStatuses = statuses.filter((status) => status.key === "cp" && status.value !== undefined);
			expect(progressStatuses.length).toBeGreaterThan(0);
			expect(stripTerminalEscapes(progressStatuses[0]?.value ?? "")).toContain("Drafting checkpoint message with Claude CLI…");
			expect(statuses.at(-1)).toEqual({ key: "cp", value: undefined });
		});
	});

	test("clears progress on failure", async () => {
		await withClaudeCliHarness(async () => {
			const pi = new FakePi(failureResult("boom"));
			const { ctx, statuses, widgets } = createContext();

			const result = await prepareCheckpointMessageForPi(pi, ctx, DIRTY_SNAPSHOT);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toContain("Claude CLI failed to draft a checkpoint message.");
				expect(result.error).toContain("exit 2: boom");
			}
			expect(widgets.some((widget) => widget.key === "cp" && widget.value !== undefined)).toBe(true);
			expect(widgets.at(-1)).toEqual({ key: "cp", value: undefined, options: undefined });
			expect(statuses.at(-1)).toEqual({ key: "cp", value: undefined });
		});
	});
});
