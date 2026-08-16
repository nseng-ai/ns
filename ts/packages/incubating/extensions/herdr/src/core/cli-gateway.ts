import {
	commandSucceeded,
	type CommandExecApi,
	formatCommand,
	formatCommandFailure,
	tailText,
} from "@nseng-ai/foundation/command";
import { formatErrorMessage, isRecord } from "@nseng-ai/foundation/primitives";

import type {
	HerdrCallerPaneResult,
	HerdrCreateTabOptions,
	HerdrCreateTabResult,
	HerdrCreateWorkspaceOptions,
	HerdrCreateWorkspaceResult,
	HerdrGateway,
	HerdrMetadataReportResult,
	HerdrMetadataToken,
	HerdrPaneRunResult,
	HerdrTabRenameResult,
	HerdrWorkspaceIdentityCandidate,
	HerdrWorkspaceIdentityCandidatesResult,
	HerdrWorkspaceRenameResult,
} from "./herdr-gateway.ts";

const HERDR_CLI_TIMEOUT_MS = 15_000;
const MAX_ERROR_CHARS = 4_000;
const MAX_ERROR_LINES = 20;

// Pure command-shape builders shared by the CLI adapter and dry-run previews
// so preview drift is test-detectable against the real invocation shape.

export function buildHerdrCreateWorkspaceArgs(options: HerdrCreateWorkspaceOptions): string[] {
	const args = ["workspace", "create"];
	if (options.shouldFocus !== true) args.push("--no-focus");
	args.push("--cwd", options.cwd);
	if (options.label !== undefined) {
		args.push("--label", options.label);
	}
	return args;
}

export function buildHerdrCreateTabArgs(options: HerdrCreateTabOptions): string[] {
	const focusFlag = options.shouldFocus === true ? "--focus" : "--no-focus";
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

export function buildHerdrPaneReportTokenArgs(paneId: string, token: HerdrMetadataToken): string[] {
	return buildHerdrReportTokenArgs("pane", paneId, token);
}

export function buildHerdrWorkspaceReportTokenArgs(
	workspaceId: string,
	token: HerdrMetadataToken,
): string[] {
	return buildHerdrReportTokenArgs("workspace", workspaceId, token);
}

export function buildHerdrTabListArgs(workspaceId: string): string[] {
	return ["tab", "list", "--workspace", workspaceId];
}

export function buildHerdrPaneListArgs(workspaceId: string): string[] {
	return ["pane", "list", "--workspace", workspaceId];
}

function buildHerdrReportTokenArgs(
	resource: "pane" | "workspace",
	resourceId: string,
	token: HerdrMetadataToken,
): string[] {
	const tokenArgs =
		token.value === null
			? ["--clear-token", token.name]
			: ["--token", `${token.name}=${token.value}`];
	return [resource, "report-metadata", resourceId, "--source", token.source, ...tokenArgs];
}

/**
 * CLI-backed HerdrGateway adapter. All operations call the installed `herdr`
 * binary; no raw socket integration is included. The CLI is Herdr's recommended
 * automation interface for ordinary scripting.
 */
export function createCliHerdrGateway(exec: CommandExecApi): HerdrGateway {
	return {
		async renameWorkspace(workspaceId, label): Promise<HerdrWorkspaceRenameResult> {
			return renameWorkspace(exec, workspaceId, label);
		},
		async renameTab(tabId, label): Promise<HerdrTabRenameResult> {
			return renameTab(exec, tabId, label);
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
		async resolveCallerPane(): Promise<HerdrCallerPaneResult> {
			return resolveCallerPane(exec);
		},
		async reportPaneToken(paneId, token): Promise<HerdrMetadataReportResult> {
			return reportToken(exec, buildHerdrPaneReportTokenArgs(paneId, token), "pane");
		},
		async reportWorkspaceToken(workspaceId, token): Promise<HerdrMetadataReportResult> {
			return reportToken(exec, buildHerdrWorkspaceReportTokenArgs(workspaceId, token), "workspace");
		},
		async resolveWorkspaceIdentityCandidates(
			workspaceId,
		): Promise<HerdrWorkspaceIdentityCandidatesResult> {
			return resolveWorkspaceIdentityCandidates(exec, workspaceId);
		},
	};
}

async function resolveCallerPane(exec: CommandExecApi): Promise<HerdrCallerPaneResult> {
	const command = "herdr";
	// Herdr's caller-aware current-pane query: `--current` resolves the pane
	// this process runs in, not whichever pane the UI happens to focus.
	const args = ["pane", "current", "--current"];
	const commandDisplay = formatCommand(command, args);
	try {
		const result = await exec.exec(command, args, { timeout: HERDR_CLI_TIMEOUT_MS });
		if (!commandSucceeded(result)) {
			return {
				type: "failed",
				message: formatCommandFailure(
					"Could not resolve the Herdr caller pane.",
					commandDisplay,
					result,
				),
			};
		}
		const parsed = parseHerdrJsonOutput(result.stdout);
		if (!parsed.ok) {
			return {
				type: "failed",
				message: `Could not resolve the Herdr caller pane: ${parsed.message}`,
			};
		}
		const workspaceId = extractString(parsed.result, "pane", "workspace_id");
		const tabId = extractString(parsed.result, "pane", "tab_id");
		const paneId = extractString(parsed.result, "pane", "pane_id");
		if (!workspaceId || !tabId || !paneId) {
			return {
				type: "failed",
				message:
					"Could not resolve the Herdr caller pane: unexpected response shape (missing workspace_id, tab_id, or pane_id).",
			};
		}
		return { type: "resolved", workspaceId, tabId, paneId };
	} catch (error) {
		return {
			type: "failed",
			message: tailText(
				`Could not resolve the Herdr caller pane.\nCommand: ${commandDisplay}\nError: ${formatErrorMessage(error)}`,
				{ maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
			),
		};
	}
}

async function reportToken(
	exec: CommandExecApi,
	args: string[],
	resource: "pane" | "workspace",
): Promise<HerdrMetadataReportResult> {
	const command = "herdr";
	const commandDisplay = formatCommand(command, args);
	try {
		const result = await exec.exec(command, args, { timeout: HERDR_CLI_TIMEOUT_MS });
		if (!commandSucceeded(result)) {
			return {
				type: "failed",
				message: formatCommandFailure(
					`Could not report Herdr ${resource} metadata.`,
					commandDisplay,
					result,
				),
			};
		}
		return { type: "reported" };
	} catch (error) {
		return {
			type: "failed",
			message: tailText(
				`Could not report Herdr ${resource} metadata.\nCommand: ${commandDisplay}\nError: ${formatErrorMessage(error)}`,
				{ maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
			),
		};
	}
}

async function resolveWorkspaceIdentityCandidates(
	exec: CommandExecApi,
	workspaceId: string,
): Promise<HerdrWorkspaceIdentityCandidatesResult> {
	const tabs = await runJsonCommand(exec, buildHerdrTabListArgs(workspaceId), "list Herdr tabs");
	if (!tabs.ok) return { type: "failed", message: tabs.message };
	const tabItems = extractRecordArray(tabs.result, "tabs");
	if (tabItems === undefined) {
		return { type: "failed", message: "Could not list Herdr tabs: unexpected response shape." };
	}
	const firstTab = tabItems[0];
	if (firstTab === undefined) return { type: "ambiguous" };
	const firstTabId = nonblankString(firstTab.tab_id);
	const firstTabWorkspaceId = nonblankString(firstTab.workspace_id);
	if (firstTabId === undefined || firstTabWorkspaceId !== workspaceId) return { type: "ambiguous" };

	const panes = await runJsonCommand(exec, buildHerdrPaneListArgs(workspaceId), "list Herdr panes");
	if (!panes.ok) return { type: "failed", message: panes.message };
	const paneItems = extractRecordArray(panes.result, "panes");
	if (paneItems === undefined) {
		return { type: "failed", message: "Could not list Herdr panes: unexpected response shape." };
	}
	const candidates: HerdrWorkspaceIdentityCandidate[] = [];
	for (const pane of paneItems) {
		if (pane.tab_id !== firstTabId) continue;
		const paneId = nonblankString(pane.pane_id);
		const tabId = nonblankString(pane.tab_id);
		const candidateWorkspaceId = nonblankString(pane.workspace_id);
		const cwd = nonblankString(pane.cwd);
		if (
			paneId === undefined ||
			tabId !== firstTabId ||
			candidateWorkspaceId !== workspaceId ||
			cwd === undefined
		) {
			return { type: "ambiguous" };
		}
		candidates.push({ paneId, cwd });
	}
	return candidates.length === 0 ? { type: "ambiguous" } : { type: "resolved", candidates };
}

async function runJsonCommand(
	exec: CommandExecApi,
	args: string[],
	action: string,
): Promise<{ ok: true; result: HerdrCliResult } | { ok: false; message: string }> {
	const command = "herdr";
	const commandDisplay = formatCommand(command, args);
	try {
		const result = await exec.exec(command, args, { timeout: HERDR_CLI_TIMEOUT_MS });
		if (!commandSucceeded(result)) {
			return {
				ok: false,
				message: formatCommandFailure(`Could not ${action}.`, commandDisplay, result),
			};
		}
		const parsed = parseHerdrJsonOutput(result.stdout);
		return parsed.ok ? parsed : { ok: false, message: `Could not ${action}: ${parsed.message}` };
	} catch (error) {
		return {
			ok: false,
			message: tailText(
				`Could not ${action}.\nCommand: ${commandDisplay}\nError: ${formatErrorMessage(error)}`,
				{ maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
			),
		};
	}
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
				message: formatCommandFailure("Could not rename Herdr workspace.", commandDisplay, result),
			};
		}
		return { type: "applied" };
	} catch (error) {
		return {
			type: "failed",
			message: tailText(
				`Could not rename Herdr workspace.\nCommand: ${commandDisplay}\nError: ${formatErrorMessage(error)}`,
				{ maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
			),
		};
	}
}

async function renameTab(
	exec: CommandExecApi,
	tabId: string,
	label: string,
): Promise<HerdrTabRenameResult> {
	const command = "herdr";
	const args = ["tab", "rename", tabId, label];
	const commandDisplay = formatCommand(command, args);
	try {
		const result = await exec.exec(command, args, { timeout: HERDR_CLI_TIMEOUT_MS });
		if (!commandSucceeded(result)) {
			return {
				type: "failed",
				message: formatCommandFailure("Could not rename Herdr tab.", commandDisplay, result),
			};
		}
		return { type: "applied" };
	} catch (error) {
		return {
			type: "failed",
			message: tailText(
				`Could not rename Herdr tab.\nCommand: ${commandDisplay}\nError: ${formatErrorMessage(error)}`,
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

function extractRecordArray(
	result: HerdrCliResult,
	fieldKey: string,
): readonly Record<string, unknown>[] | undefined {
	const value = result[fieldKey];
	if (!Array.isArray(value) || !value.every(isRecord)) return undefined;
	return value;
}

function nonblankString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value : undefined;
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
