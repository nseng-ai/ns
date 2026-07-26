import { appendFileSync } from "node:fs";
import process from "node:process";

import { ensurePrivateParentDirectorySync, requireNsStatePath } from "@nseng-ai/extension-kit/xdg";

const CLI_COMMAND_BRIDGE_VERSION = "above-editor-live-stream-trace-v3";
const TRACE_ENV = "NS_PI_CLI_TRACE";
const TRACE_OUTPUT_ENV = "NS_PI_CLI_TRACE_OUTPUT";
const TRACE_PATH_ENV = "NS_PI_CLI_TRACE_PATH";
const DEFAULT_TRACE_FILENAME = "ns-pi-cli-command-extension.jsonl";
const TRACE_OUTPUT_PREVIEW_CHARS = 500;

type TraceFields = Record<string, unknown>;

export function cliCommandTracePath(env: Record<string, string | undefined> = process.env): string {
	return requireNsStatePath({
		env,
		overrideEnvName: TRACE_PATH_ENV,
		segments: ["pi-cli-command-extension", DEFAULT_TRACE_FILENAME],
	});
}

export function traceCliCommand(event: string, fields: TraceFields = {}): void {
	if (!isTraceEnabled(process.env)) return;

	const record = {
		timestamp: new Date().toISOString(),
		pid: process.pid,
		version: CLI_COMMAND_BRIDGE_VERSION,
		event,
		...fields,
	};

	try {
		const path = cliCommandTracePath(process.env);
		ensurePrivateParentDirectorySync(path);
		appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
	} catch {
		// Trace logging is diagnostic only and must never affect command execution.
	}
}

export function outputTraceFields(stdout: string, stderr: string): TraceFields {
	const fields: TraceFields = {
		stderrChars: stderr.length,
		stdoutChars: stdout.length,
	};
	if (process.env[TRACE_OUTPUT_ENV] === "1") {
		fields.stdoutPreview = tracePreview(stdout);
		fields.stderrPreview = tracePreview(stderr);
	}
	return fields;
}

function isTraceEnabled(env: Record<string, string | undefined>): boolean {
	const value = env[TRACE_ENV]?.toLowerCase();
	return value !== "0" && value !== "false" && value !== "off";
}

function tracePreview(text: string): string {
	if (text.length <= TRACE_OUTPUT_PREVIEW_CHARS) return text;
	return `${text.slice(0, TRACE_OUTPUT_PREVIEW_CHARS)}…`;
}
