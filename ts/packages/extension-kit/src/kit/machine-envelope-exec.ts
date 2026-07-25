import {
	commandSucceeded,
	type CommandExecApi,
	type ExecResult,
	formatCommand,
	formatCommandFailure,
	tailText,
} from "@nseng-ai/foundation/command";
import {
	parseMachineEnvelopeData,
	type MachineEnvelopeDataParseValid,
} from "@nseng-ai/foundation/machine-envelope";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

const DEFAULT_MAX_ERROR_CHARS = 4_000;
const DEFAULT_MAX_ERROR_LINES = 20;

export interface JsonExecCommandOptions {
	pi: CommandExecApi;
	cwd: string;
	command: string;
	args: string[];
	timeoutMs: number;
	/** Human-facing first line for every failure message. */
	summary: string;
	/** Machine-envelope label naming the expected JSON payload. */
	label: string;
	errorTail?: { maxChars: number; maxLines: number };
}

export type JsonExecCommandFailure = { type: "failed"; message: string };

/**
 * Run a machine-output CLI command and parse its stdout as a machine-envelope
 * JSON payload. Startup failures, non-zero exits (including failed envelopes
 * carried on stdout), and invalid envelopes all collapse into one typed,
 * bounded failure message.
 */
export async function runJsonExecCommand(
	options: JsonExecCommandOptions,
): Promise<MachineEnvelopeDataParseValid | JsonExecCommandFailure> {
	const errorTail = options.errorTail ?? {
		maxChars: DEFAULT_MAX_ERROR_CHARS,
		maxLines: DEFAULT_MAX_ERROR_LINES,
	};
	let result: ExecResult;
	try {
		result = await options.pi.exec(options.command, options.args, {
			cwd: options.cwd,
			timeout: options.timeoutMs,
		});
	} catch (error) {
		return {
			type: "failed",
			message: formatStartupFailure(
				options.summary,
				options.command,
				options.args,
				error,
				errorTail,
			),
		};
	}

	const commandDisplay = formatCommand(options.command, options.args);
	if (!commandSucceeded(result)) {
		return {
			type: "failed",
			message: formatFailedEnvelopeOrExecFailure(
				options.summary,
				commandDisplay,
				result,
				options.label,
				errorTail,
			),
		};
	}

	const parsed = parseMachineEnvelopeData(result.stdout, {
		label: options.label,
		stdoutTail: errorTail,
	});
	if (parsed.type !== "valid") return { type: "failed", message: parsed.message };

	return parsed;
}

function formatStartupFailure(
	summary: string,
	command: string,
	args: readonly string[],
	error: unknown,
	errorTail: { maxChars: number; maxLines: number },
): string {
	return tailText(
		`${summary}\nCommand: ${formatCommand(command, args)}\nError: ${formatErrorMessage(error)}`,
		errorTail,
	);
}

function formatFailedEnvelopeOrExecFailure(
	summary: string,
	commandDisplay: string,
	result: ExecResult,
	label: string,
	errorTail: { maxChars: number; maxLines: number },
): string {
	if (result.stdout.trim().length > 0) {
		const parsed = parseMachineEnvelopeData(result.stdout, {
			label,
			stdoutTail: errorTail,
		});
		if (parsed.type !== "valid") {
			return `${summary}\nCommand: ${commandDisplay}\n${parsed.message}`;
		}
	}
	return formatCommandFailure(summary, commandDisplay, result);
}
