import { DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS } from "./constants.ts";

export type WatchCommandAction = "toggle" | "start" | "stop" | "status" | "once";
export type ExistingFeedbackMode = "dispatch" | "baseline";

export type WatchCommandParseResult =
	| { type: "valid"; action: WatchCommandAction; options: WatchCommandOptions }
	| { type: "invalid"; message: string };

export interface WatchCommandOptions {
	intervalMs: number;
	shouldAllowDirty: boolean;
	existingFeedbackMode: ExistingFeedbackMode;
}
export function parseWatchCommandArgs(
	rawArgs: string,
	minimumIntervalMs = MIN_INTERVAL_MS,
): WatchCommandParseResult {
	const tokens = rawArgs.trim().length === 0 ? [] : rawArgs.trim().split(/\s+/);
	const explicitActionToken = tokens[0];
	const hasExplicitAction =
		explicitActionToken !== undefined && !explicitActionToken.startsWith("--");
	const actionToken =
		tokens.length === 0 ? "toggle" : hasExplicitAction ? explicitActionToken : "start";
	if (!isWatchCommandAction(actionToken)) {
		return { type: "invalid", message: `Unknown pr-watch-feedback action: ${actionToken}` };
	}
	if ((actionToken === "stop" || actionToken === "status") && tokens.length > 1) {
		return { type: "invalid", message: `${actionToken} does not accept options.` };
	}

	const options: WatchCommandOptions = {
		intervalMs: DEFAULT_INTERVAL_MS,
		shouldAllowDirty: true,
		existingFeedbackMode: "dispatch",
	};
	let hasDispatchExistingFlag = false;
	let hasBaselineExistingFlag = false;

	const optionStartIndex = hasExplicitAction ? 1 : 0;
	for (let index = optionStartIndex; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === "--allow-dirty") {
			options.shouldAllowDirty = true;
			continue;
		}
		if (token === "--pause-on-dirty") {
			options.shouldAllowDirty = false;
			continue;
		}
		if (token === "--dispatch-existing") {
			hasDispatchExistingFlag = true;
			options.existingFeedbackMode = "dispatch";
			continue;
		}
		if (token === "--baseline-existing") {
			hasBaselineExistingFlag = true;
			options.existingFeedbackMode = "baseline";
			continue;
		}
		if (token === "--interval-seconds") {
			const value = tokens[index + 1];
			if (value === undefined)
				return { type: "invalid", message: "--interval-seconds requires a value." };
			const seconds = Number(value);
			if (!Number.isInteger(seconds) || seconds <= 0) {
				return { type: "invalid", message: "--interval-seconds must be a positive integer." };
			}
			const intervalMs = seconds * 1_000;
			if (intervalMs < minimumIntervalMs) {
				return {
					type: "invalid",
					message: `--interval-seconds must be at least ${minimumIntervalMs / 1_000}.`,
				};
			}
			options.intervalMs = intervalMs;
			index += 1;
			continue;
		}
		return { type: "invalid", message: `Unknown pr-watch-feedback option: ${token}` };
	}
	if (hasDispatchExistingFlag && hasBaselineExistingFlag) {
		return {
			type: "invalid",
			message: "--dispatch-existing and --baseline-existing cannot be used together.",
		};
	}

	return { type: "valid", action: actionToken, options };
}
export function shouldDispatchExistingFeedback(options: WatchCommandOptions): boolean {
	return options.existingFeedbackMode === "dispatch";
}

function isWatchCommandAction(value: string): value is WatchCommandAction {
	return (
		value === "toggle" ||
		value === "start" ||
		value === "stop" ||
		value === "status" ||
		value === "once"
	);
}
