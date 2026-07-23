import { formatCommand, type ExecResult } from "@nseng-ai/foundation/command";
import { ScriptedQueue } from "@nseng-ai/foundation/test-kit";
import { expect } from "vitest";
import {
	executeStackLanding,
	parseArgs,
	registerLandStackRenderer,
} from "../../../src/land/land-stack.ts";
import { type LandResult } from "../../../src/land/results.ts";
import type {
	LandStackCommandContext,
	LandStackExtensionAPI,
	NotifyLevel,
} from "../../../src/land/stack/types.ts";

export const ROOT = "/repo";

export const CURRENT_SLOT_ROOT = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-03";

export const TRUNK = "main";

export type MessageRenderer = Parameters<
	NonNullable<LandStackExtensionAPI["registerMessageRenderer"]>
>[1];

export type SentMessage = Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[0] & {
	options?: Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[1];
};

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

export class FakePi implements LandStackExtensionAPI {
	readonly execCalls: ExecCall[] = [];
	readonly messageRenderers = new Map<string, MessageRenderer>();
	readonly messages: SentMessage[] = [];
	private readonly script: ScriptedQueue<ScriptedExec>;

	constructor(script: ScriptedExec[] = []) {
		this.script = new ScriptedQueue(script, (step) => step);
	}

	registerMessageRenderer(customType: string, renderer: MessageRenderer): void {
		this.messageRenderers.set(customType, renderer);
	}

	sendMessage(
		message: Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[0],
		options?: SentMessage["options"],
	): void {
		this.messages.push({ ...message, ...(options === undefined ? {} : { options }) });
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
		executeOptions?: Omit<Parameters<typeof executeStackLanding>[3], "hasSlotsExtension"> & {
			hasSlotsExtension?: boolean;
		};
	} = {},
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	confirmations: Confirmation[];
	statuses: StatusUpdate[];
	widgets: WidgetUpdate[];
	waitForIdleCalls: () => number;
	messages: SentMessage[];
}> {
	const pi = new FakePi(script);
	registerLandStackRenderer(pi);
	const context = createContext(contextOptions);
	const parsedArgs = expectSuccess(parseArgs(args));
	await executeStackLanding(pi, context.ctx, parsedArgs, {
		...contextOptions.executeOptions,
		hasSlotsExtension: contextOptions.executeOptions?.hasSlotsExtension ?? true,
	});
	return { pi, messages: pi.messages, ...context };
}

export function commandMessagesText(messages: SentMessage[]): string {
	return messages.map((message) => messageContentText(message.content)).join("\n");
}

export function messageContentText(content: SentMessage["content"]): string {
	if (typeof content === "string") return content;
	return content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
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
