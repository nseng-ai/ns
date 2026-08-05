import { formatCommand, type ExecResult } from "@nseng-ai/foundation/command";
import { ScriptedQueue } from "@nseng-ai/foundation/test-kit";
import { expect } from "vitest";
import { executeStackLanding, parseArgs } from "../../../src/land/land-stack.ts";
import { renderLandWorkflowResult } from "../../../src/land/command-result.ts";
import { type LandResult } from "../../../src/land/results.ts";
import type {
	LandStackCommandContext,
	LandExecutionApi,
	NotifyLevel,
} from "../../../src/land/stack/types.ts";

export const ROOT = "/repo";

export const CURRENT_SLOT_ROOT = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-03";

export const TRUNK = "main";

export interface SentMessage {
	content: string;
	details?: unknown;
}

export interface ExecCall {
	command: string;
	args: string[];
	options?: { cwd?: string; timeout?: number };
}

export interface ScriptedExec {
	command: string;
	args: string[];
	result: ExitedResultFields | undefined;
}

export interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

export interface Confirmation {
	title: string;
	message: string;
}

export interface StatusUpdate {
	key: string;
	value: string | undefined;
}

export interface WidgetUpdate {
	key: string;
	value: string[] | undefined;
	options?: { placement?: "aboveEditor" | "belowEditor" };
}

export class FakeLandExecutionApi implements LandExecutionApi {
	readonly execCalls: ExecCall[] = [];
	readonly messages: SentMessage[] = [];
	private readonly script: ScriptedQueue<ScriptedExec>;

	constructor(script: ScriptedExec[] = []) {
		this.script = new ScriptedQueue(script, (step) => step);
	}

	message(content: string, options?: { details?: unknown }): void {
		this.messages.push({
			content,
			...(options?.details === undefined ? {} : { details: options.details }),
		});
	}

	async exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult> {
		this.execCalls.push({
			command,
			args: [...args],
			...(options === undefined ? {} : { options }),
		});
		const missingStepMessage = `unexpected exec: ${formatCommand(command, args)}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return execResult({ code: 99, stderr: missingStepMessage });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${formatCommand(expected.command, expected.args)}, got ${formatCommand(command, args)}`;
			this.script.recordError(message);
			return execResult({ code: 99, stderr: message });
		}

		return execResult(expected.result);
	}

	assertDone(): void {
		this.script.assertDone();
	}
}

export function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

export interface ExitedResultFields {
	stdout?: string;
	stderr?: string;
	code?: number | null;
	signal?: string | null;
}

export function execResult(overrides: ExitedResultFields = {}): ExecResult {
	return {
		type: "exited",
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		signal: overrides.signal ?? null,
	};
}

export function expectSuccess<T>(result: LandResult<T>): T {
	expect(result.type).toBe("success");
	if (result.type !== "success") {
		throw new Error(`Expected land-stack success, got failure: ${result.failure.message}`);
	}
	return result.value;
}

export function step(command: string, args: string[], result?: ExitedResultFields): ScriptedExec {
	return { command, args, result };
}

export function createContext(
	options: { cwd?: string; hasUI?: boolean; confirms?: boolean[] } = {},
): {
	ctx: LandStackCommandContext;
	notifications: Notification[];
	confirmations: Confirmation[];
	statuses: StatusUpdate[];
	widgets: WidgetUpdate[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const confirmations: Confirmation[] = [];
	const statuses: StatusUpdate[] = [];
	const widgets: WidgetUpdate[] = [];
	const confirmAnswers = [...(options.confirms ?? [true])];
	let waits = 0;

	const ctx: LandStackCommandContext = {
		cwd: options.cwd ?? ROOT,
		hasUI: options.hasUI ?? true,
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			async confirm(title: string, message: string): Promise<boolean> {
				confirmations.push({ title, message });
				return confirmAnswers.shift() ?? false;
			},
			setStatus(key: string, value: string | undefined): void {
				statuses.push({ key, value });
			},
			setWidget(
				key: string,
				value: string[] | undefined,
				options?: { placement?: "aboveEditor" | "belowEditor" },
			): void {
				widgets.push({ key, value, ...(options === undefined ? {} : { options }) });
			},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, confirmations, statuses, widgets, waitForIdleCalls: () => waits };
}

export async function runLandStack(
	args: string,
	script: ScriptedExec[],
	contextOptions: {
		cwd?: string;
		hasUI?: boolean;
		confirms?: boolean[];
		executeOptions?: Parameters<typeof executeStackLanding>[3];
	} = {},
): Promise<{
	pi: FakeLandExecutionApi;
	notifications: Notification[];
	confirmations: Confirmation[];
	statuses: StatusUpdate[];
	widgets: WidgetUpdate[];
	waitForIdleCalls: () => number;
	messages: SentMessage[];
}> {
	const pi = new FakeLandExecutionApi(script);
	const context = createContext(contextOptions);
	// Permanent command transcripts exercise destructive Graphite cleanup unless a scenario opts
	// into another policy through the canonical execution tests.
	const parsedArgs = expectSuccess(parseArgs(args.includes("--free") ? args : `${args} --free`));
	const execution = await executeStackLanding(
		pi,
		context.ctx,
		parsedArgs,
		contextOptions.executeOptions,
	);
	const rendered = renderLandWorkflowResult(
		{
			isTty: false,
			colorDepth: "none",
			columns: 80,
			canRenderUnicode: true,
		},
		{ type: "stack", execution },
	);
	context.ctx.ui.notify(
		rendered,
		execution.type === "failed"
			? "error"
			: execution.report.warnings.length > 0
				? "warning"
				: "success",
	);
	pi.message?.(rendered);
	return { pi, messages: pi.messages, ...context };
}

export function commandMessagesText(messages: SentMessage[]): string {
	return messages.map((message) => messageContentText(message.content)).join("\n");
}

export function messageContentText(content: SentMessage["content"]): string {
	return content;
}

export function worktreeOutput(entries: Array<{ path: string; branch?: string }>): string {
	return entries
		.map((entry) => {
			const lines = [`worktree ${entry.path}`, "HEAD 0000000000000000000000000000000000000000"];
			if (entry.branch) {
				lines.push(`branch refs/heads/${entry.branch}`);
			}
			return lines.join("\n");
		})
		.join("\n\n");
}

export async function captureConsole<T>(run: () => Promise<T>): Promise<T> {
	const originalLog = console.log;
	const originalError = console.error;
	console.log = () => undefined;
	console.error = () => undefined;
	try {
		return await run();
	} finally {
		console.log = originalLog;
		console.error = originalError;
	}
}
