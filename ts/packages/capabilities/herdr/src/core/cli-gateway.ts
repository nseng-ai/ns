import {
	commandSucceeded,
	type CommandExecApi,
	formatCommand,
	formatCommandFailure,
	tailText,
} from "@nseng-ai/foundation/command";
import { formatErrorMessage, isRecord } from "@nseng-ai/foundation/primitives";

import type {
	HerdrCreateTabOptions,
	HerdrCreateTabResult,
	HerdrCreateWorkspaceOptions,
	HerdrCreateWorkspaceResult,
	HerdrGateway,
	HerdrPaneRunResult,
	HerdrPaneTitleResult,
	HerdrWorkspaceRenameResult,
} from "./herdr-gateway.ts";

const HERDR_CLI_TIMEOUT_MS = 15_000;
const MAX_ERROR_CHARS = 4_000;
const MAX_ERROR_LINES = 20;
const OBJECTIVE_SIDEBAR_METADATA_SOURCE = "ns-objective-sidebar";

// Pure command-shape builders shared by the CLI adapter and dry-run previews
// so preview drift is test-detectable against the real invocation shape.

export function buildHerdrCreateWorkspaceArgs(options: HerdrCreateWorkspaceOptions): string[] {
	const args = ["workspace", "create", "--no-focus", "--cwd", options.cwd];
	if (options.label !== undefined) {
		args.push("--label", options.label);
	}
	return args;
}

export function buildHerdrCreateTabArgs(options: HerdrCreateTabOptions): string[] {
	const focusFlag = options.focus === true ? "--focus" : "--no-focus";
	const args = ["tab", "create", "--workspace", options.workspaceId, focusFlag];
	if (options.cwd !== undefined) {
		args.push("--cwd", options.cwd);
	}
	if (options.label !== undefined) {
		args.push("--label", options.label);
	}
	return args;
}

export function buildHerdrPaneRunArgs(paneId: string, command: string): string[] {
	return ["pane", "run", paneId, command];
}

export function buildHerdrPaneTitleArgs(paneId: string, title: string): string[] {
	return [
		"pane",
		"report-metadata",
		paneId,
		"--source",
		OBJECTIVE_SIDEBAR_METADATA_SOURCE,
		"--title",
		title,
	];
}

/**
 * CLI-backed HerdrGateway adapter. All operations call the installed `herdr`
 * binary; no raw socket integration is included. The CLI is Herdr's recommended
 * automation surface for ordinary scripting.
 */
export function createCliHerdrGateway(exec: CommandExecApi): HerdrGateway {
	return {
		async renameWorkspace(workspaceId, label): Promise<HerdrWorkspaceRenameResult> {
			return renameWorkspace(exec, workspaceId, label);
		},
		async reportPaneTitle(paneId, title): Promise<HerdrPaneTitleResult> {
			return reportPaneTitle(exec, paneId, title);
		},
		async createWorkspace(options): Promise<HerdrCreateWorkspaceResult> {
			return createWorkspace(exec, options);
		},
		async createTab(options): Promise<HerdrCreateTabResult> {
			return createTab(exec, options);
		},
		async runInPane(paneId, command): Promise<HerdrPaneRunResult> {
			return runInPane(exec, paneId, command);
		},
	};
}

async function renameWorkspace(
	exec: CommandExecApi,
	workspaceId: string,
	label: string,
): Promise<HerdrWorkspaceRenameResult> {
	const command = "herdr";
	const args = ["workspace", "rename", workspaceId, label];
	const commandDisplay = formatCommand(command, args);
	try {
		const result = await exec.exec(command, args, { timeout: HERDR_CLI_TIMEOUT_MS });
		if (!commandSucceeded(result)) {
			return {
				type: "failed",
				message: formatCommandFailure(
					"Could not apply Herdr Objective sidebar label.",
					commandDisplay,
					result,
				),
			};
		}
		return { type: "applied" };
	} catch (error) {
		return {
			type: "failed",
			message: tailText(
				`Could not apply Herdr Objective sidebar label.\nCommand: ${commandDisplay}\nError: ${formatErrorMessage(error)}`,
				{ maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
			),
		};
	}
}

async function reportPaneTitle(
	exec: CommandExecApi,
	paneId: string,
	title: string,
): Promise<HerdrPaneTitleResult> {
	const command = "herdr";
	const args = buildHerdrPaneTitleArgs(paneId, title);
	const commandDisplay = formatCommand(command, args);
	try {
		const result = await exec.exec(command, args, { timeout: HERDR_CLI_TIMEOUT_MS });
		if (!commandSucceeded(result)) {
			return {
				type: "failed",
				message: formatCommandFailure(
					"Could not apply Herdr Objective sidebar slot title.",
					commandDisplay,
					result,
				),
			};
		}
		return { type: "applied" };
	} catch (error) {
		return {
			type: "failed",
			message: tailText(
				`Could not apply Herdr Objective sidebar slot title.\nCommand: ${commandDisplay}\nError: ${formatErrorMessage(error)}`,
				{ maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
			),
		};
	}
}

async function createWorkspace(
	exec: CommandExecApi,
	options: HerdrCreateWorkspaceOptions,
): Promise<HerdrCreateWorkspaceResult> {
	const command = "herdr";
	const args = buildHerdrCreateWorkspaceArgs(options);
	const commandDisplay = formatCommand(command, args);
	try {
		const result = await exec.exec(command, args, { timeout: HERDR_CLI_TIMEOUT_MS });
		if (!commandSucceeded(result)) {
			return {
				type: "failed",
				message: formatCommandFailure("Could not create Herdr workspace.", commandDisplay, result),
			};
		}
		const parsed = parseHerdrJsonOutput(result.stdout);
		if (!parsed.ok) {
			return {
				type: "failed",
				message: `Could not create Herdr workspace: ${parsed.message}`,
			};
		}
		const r = parsed.result;
		const workspaceId = extractString(r, "workspace", "workspace_id");
		const rootPaneId = extractString(r, "root_pane", "pane_id");
		const tabId = extractString(r, "tab", "tab_id");
		if (!workspaceId || !rootPaneId || !tabId) {
			return {
				type: "failed",
				message: `Could not create Herdr workspace: unexpected response shape (missing workspace_id, pane_id, or tab_id).`,
			};
		}
		return { type: "created", workspaceId, rootPaneId, tabId };
	} catch (error) {
		return {
			type: "failed",
			message: tailText(
				`Could not create Herdr workspace.\nCommand: ${commandDisplay}\nError: ${formatErrorMessage(error)}`,
				{ maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
			),
		};
	}
}

async function createTab(
	exec: CommandExecApi,
	options: HerdrCreateTabOptions,
): Promise<HerdrCreateTabResult> {
	const command = "herdr";
	const args = buildHerdrCreateTabArgs(options);
	const commandDisplay = formatCommand(command, args);
	try {
		const result = await exec.exec(command, args, { timeout: HERDR_CLI_TIMEOUT_MS });
		if (!commandSucceeded(result)) {
			return {
				type: "failed",
				message: formatCommandFailure("Could not create Herdr tab.", commandDisplay, result),
			};
		}
		const parsed = parseHerdrJsonOutput(result.stdout);
		if (!parsed.ok) {
			return {
				type: "failed",
				message: `Could not create Herdr tab: ${parsed.message}`,
			};
		}
		const r = parsed.result;
		const tabId = extractString(r, "tab", "tab_id");
		const rootPaneId = extractString(r, "root_pane", "pane_id");
		const workspaceId = extractString(r, "tab", "workspace_id");
		if (!tabId || !rootPaneId || !workspaceId) {
			return {
				type: "failed",
				message: `Could not create Herdr tab: unexpected response shape (missing tab_id, pane_id, or workspace_id).`,
			};
		}
		return { type: "created", tabId, rootPaneId, workspaceId };
	} catch (error) {
		return {
			type: "failed",
			message: tailText(
				`Could not create Herdr tab.\nCommand: ${commandDisplay}\nError: ${formatErrorMessage(error)}`,
				{ maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
			),
		};
	}
}

async function runInPane(
	exec: CommandExecApi,
	paneId: string,
	command: string,
): Promise<HerdrPaneRunResult> {
	const herdrCommand = "herdr";
	const args = buildHerdrPaneRunArgs(paneId, command);
	const commandDisplay = formatCommand(herdrCommand, args);
	try {
		const result = await exec.exec(herdrCommand, args, { timeout: HERDR_CLI_TIMEOUT_MS });
		if (!commandSucceeded(result)) {
			return {
				type: "failed",
				message: formatCommandFailure(
					"Could not run command in Herdr pane.",
					commandDisplay,
					result,
				),
			};
		}
		return { type: "ok" };
	} catch (error) {
		return {
			type: "failed",
			message: tailText(
				`Could not run command in Herdr pane.\nCommand: ${commandDisplay}\nError: ${formatErrorMessage(error)}`,
				{ maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
			),
		};
	}
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

type HerdrCliResult = Record<string, unknown>;

function parseHerdrJsonOutput(
	stdout: string,
): { ok: true; result: HerdrCliResult } | { ok: false; message: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout.trim());
	} catch {
		return { ok: false, message: `unparseable JSON response: ${stdout.slice(0, 200)}` };
	}
	if (!isRecord(parsed)) {
		return { ok: false, message: "response was not an object" };
	}
	const result = parsed.result;
	if (!isRecord(result)) {
		return { ok: false, message: '"result" field missing or not an object' };
	}
	return { ok: true, result };
}

function extractString(
	result: HerdrCliResult,
	containerKey: string,
	fieldKey: string,
): string | undefined {
	const container = result[containerKey];
	if (!isRecord(container)) return undefined;
	const value = container[fieldKey];
	return typeof value === "string" ? value : undefined;
}
