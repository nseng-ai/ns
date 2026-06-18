import { truncatedSha256Digest } from "@asdl/core";

const HARNESS_SESSION_ENTRY_TYPE = "asdl-harness-session-id";
const HARNESS_SESSION_ENV = "HARNESS_SESSION_ID";

interface CustomSessionEntry {
	type: "custom";
	customType: string;
	data?: unknown;
}

interface SessionManager {
	getSessionFile(): string | undefined;
	getEntries(): readonly unknown[];
}

interface SessionContext {
	sessionManager: SessionManager;
}

interface ToolCallEvent {
	toolName: string;
	input: unknown;
}

export interface ExtensionAPI {
	on(
		event: "session_start",
		handler: (event: unknown, ctx: SessionContext) => Promise<void> | void,
	): void;
	on(
		event: "tool_call",
		handler: (
			event: ToolCallEvent,
			ctx: unknown,
		) => Promise<ToolCallResult | void> | ToolCallResult | void,
	): void;
	appendEntry(customType: string, data?: unknown): Promise<void> | void;
}

export interface HarnessSessionDeps {
	nowMs(): number;
	entropy(): string;
}

export interface ToolCallResult {
	block: true;
	reason?: string;
}

interface HarnessSessionState {
	harnessSessionId: string | null;
}

export default function harnessSessionExtension(pi: ExtensionAPI): void {
	registerHarnessSessionExtension(pi, {
		nowMs: () => Date.now(),
		entropy: () => Math.random().toString(36).slice(2),
	});
}

export function registerHarnessSessionExtension(
	pi: ExtensionAPI,
	deps: HarnessSessionDeps,
): HarnessSessionState {
	const state: HarnessSessionState = { harnessSessionId: null };

	pi.on("session_start", async (_event, ctx) => {
		state.harnessSessionId = await resolveHarnessSessionId(pi, ctx.sessionManager, deps);
	});

	pi.on("tool_call", (event) => {
		if (!isBashToolCall(event)) return;
		if (state.harnessSessionId === null) {
			return {
				block: true,
				reason: `${HARNESS_SESSION_ENV} has not been initialized for this Pi session.`,
			};
		}
		if (commandSetsHarnessSessionId(event.input.command)) return;
		event.input.command = `${exportHarnessSessionCommand(state.harnessSessionId)}\n${event.input.command}`;
	});

	return state;
}

export function shellSingleQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function exportHarnessSessionCommand(harnessSessionId: string): string {
	return `export ${HARNESS_SESSION_ENV}=${shellSingleQuote(harnessSessionId)}`;
}

function commandSetsHarnessSessionId(command: string): boolean {
	const trimmed = command.trimStart();
	return (
		trimmed.startsWith(`${HARNESS_SESSION_ENV}=`) ||
		trimmed.startsWith(`export ${HARNESS_SESSION_ENV}=`)
	);
}

async function resolveHarnessSessionId(
	pi: ExtensionAPI,
	sessionManager: SessionManager,
	deps: HarnessSessionDeps,
): Promise<string> {
	const restored = restoreHarnessSessionId(sessionManager.getEntries());
	if (restored !== null) return restored;

	const sessionFile = sessionManager.getSessionFile();
	if (sessionFile !== undefined && sessionFile !== "")
		return sessionFileHarnessSessionId(sessionFile);

	const generated = `pi-ephemeral-${deps.nowMs()}-${deps.entropy()}`;
	await pi.appendEntry(HARNESS_SESSION_ENTRY_TYPE, { harnessSessionId: generated });
	return generated;
}

function sessionFileHarnessSessionId(sessionFile: string): string {
	return `pi-session-file-${truncatedSha256Digest(sessionFile)}`;
}

function restoreHarnessSessionId(entries: readonly unknown[]): string | null {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (!isCustomSessionEntry(entry)) continue;
		if (entry.customType !== HARNESS_SESSION_ENTRY_TYPE) continue;
		const data = entry.data;
		if (typeof data !== "object" || data === null || !("harnessSessionId" in data)) continue;
		const harnessSessionId = (data as { harnessSessionId?: unknown }).harnessSessionId;
		if (typeof harnessSessionId === "string" && harnessSessionId !== "") return harnessSessionId;
	}
	return null;
}

function isCustomSessionEntry(value: unknown): value is CustomSessionEntry {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		"customType" in value &&
		(value as { type?: unknown }).type === "custom"
	);
}

function isBashToolCall(
	event: ToolCallEvent,
): event is ToolCallEvent & { input: { command: string } } {
	if (event.toolName !== "bash") return false;
	return (
		typeof event.input === "object" &&
		event.input !== null &&
		"command" in event.input &&
		typeof (event.input as { command?: unknown }).command === "string"
	);
}
