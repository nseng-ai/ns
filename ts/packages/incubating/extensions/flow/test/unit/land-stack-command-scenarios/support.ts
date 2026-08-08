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
		cleanupPolicy?: "free" | "preserve";
		useExactScript?: boolean;
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
	const pi = new FakeLandExecutionApi(
		contextOptions.useExactScript === true ? script : withStrictCleanupRereads(script),
	);
	const context = createContext(contextOptions);
	// Permanent command transcripts temporarily default to destructive Graphite cleanup. New
	// preserve scenarios opt in explicitly until PR 2 migrates the remaining fixtures.
	const cleanupPolicy = contextOptions.cleanupPolicy ?? "free";
	const parsedArgs = expectSuccess(
		parseArgs(cleanupPolicy === "free" && !args.includes("--free") ? `${args} --free` : args),
	);
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

function withStrictCleanupRereads(script: readonly ScriptedExec[]): ScriptedExec[] {
	const legacyCleanup: Array<{
		check: ScriptedExec;
		deletion: ScriptedExec;
	}> = [];
	const removed = new Set<number>();
	for (const [index, entry] of script.entries()) {
		if (entry.command !== "gt" || entry.args[0] !== "delete") continue;
		const check = script[index - 1];
		if (!isTopologyRead(check)) continue;
		legacyCleanup.push({ check, deletion: entry });
		let checkIndex = index - 1;
		while (checkIndex >= 0 && isTopologyRead(script[checkIndex])) {
			removed.add(checkIndex);
			checkIndex -= 1;
		}
		removed.add(index);
	}
	if (legacyCleanup.length === 0) return [...script];
	const firstCleanupIndex = Math.min(...removed);
	const retainedBefore = script.filter(
		(_entry, index) => index < firstCleanupIndex && !removed.has(index),
	);
	const retainedAfter = script.filter(
		(entry, index) => index >= firstCleanupIndex && !removed.has(index) && !isTopologyRead(entry),
	);
	return [
		...retainedBefore,
		...legacyCleanup.map(({ check }) => check),
		...retainedAfter,
		...legacyCleanup
			.toSorted((left, right) =>
				compareCleanupBranches(right.deletion.args[1], left.deletion.args[1]),
			)
			.flatMap(({ check, deletion }) => [{ ...check, args: [...check.args] }, deletion]),
	];
}

function compareCleanupBranches(left: string | undefined, right: string | undefined): number {
	const leftNumber = /^feature-(\d+)$/.exec(left ?? "")?.[1];
	const rightNumber = /^feature-(\d+)$/.exec(right ?? "")?.[1];
	if (leftNumber !== undefined && rightNumber !== undefined)
		return Number(leftNumber) - Number(rightNumber);
	return (left ?? "").localeCompare(right ?? "");
}

function isTopologyRead(entry: ScriptedExec | undefined): entry is ScriptedExec {
	return (
		entry?.command === "ns" &&
		entry.args[0] === "flow" &&
		entry.args[2] === "read-graphite-branch-metadata"
	);
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
