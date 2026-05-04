import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

const STATUS_KEY = "objective-claim";
const CUSTOM_TYPE = "objective-claim";
const DEFAULT_TIMEOUT_MS = 30_000;

type ObjectiveCommandCandidate = {
	command: string;
	prefixArgs: string[];
};

type ClinkrEnvelope<T> = {
	exit_code: number;
	data?: T;
	error_type?: string;
	message?: string;
};

type ObjectiveRun = {
	commandText: string;
	envelope: ClinkrEnvelope<unknown>;
};

type ClaimSelectionOption = {
	label: string;
	value: string;
	description?: string | null;
	rerun_args: string[];
};

type ClaimSelection = {
	kind: string;
	prompt: string;
	options: ClaimSelectionOption[];
};

type ClaimBlock = {
	reason: string;
	message: string;
};

type CarriedFile = {
	file: string;
	key?: string;
};

type ClaimApplyResult = {
	schema?: string;
	slug: string;
	target_branch: string;
	source_kind?: string;
	source_branch?: string | null;
	source_label: string;
	files_carried: CarriedFile[];
	destination_ref: string;
	destination_commit_sha: string;
};

type ClaimCommandResult = {
	schema: string;
	status: "claimed" | "needs_selection" | "blocked" | string;
	message: string;
	result?: ClaimApplyResult | null;
	selection?: ClaimSelection | null;
	block?: ClaimBlock | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function messageFromUnknown(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function splitArgs(argsText: string): string[] {
	return argsText
		.trim()
		.split(/\s+/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

function sanitizeArgs(argsText: string): string[] {
	const tokens = splitArgs(argsText);
	for (const token of tokens) {
		if (token === "--format" || token.startsWith("--format=")) {
			throw new Error("/objective-claim always uses JSON internally. Omit --format.");
		}
		if (token === "--schema" || token.startsWith("--schema=")) {
			throw new Error("/objective-claim does not support --schema. Run `objective exec claim --schema` in a shell instead.");
		}
		if (token === "-h" || token === "--help") {
			throw new Error("Usage: /objective-claim [slug] [--target <branch>] [--from <branch>] [--from-file <path>]");
		}
	}
	return tokens;
}

function shellQuote(part: string): string {
	return /^[A-Za-z0-9_./:@%+=,-]+$/.test(part) ? part : JSON.stringify(part);
}

function formatCommand(parts: string[]): string {
	return parts.map(shellQuote).join(" ");
}

function summarizeOutput(value: string): string {
	const trimmed = value.trim().replace(/\s+/g, " ");
	return trimmed.length > 220 ? `${trimmed.slice(0, 217)}...` : trimmed;
}

function findAncestorContaining(startDir: string, relativePath: string): string | undefined {
	let current = resolve(startDir);
	for (;;) {
		if (existsSync(join(current, relativePath))) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) {
			return undefined;
		}
		current = parent;
	}
}

function resolveObjectiveCommandCandidates(cwd: string): ObjectiveCommandCandidate[] {
	const candidates: ObjectiveCommandCandidate[] = [];
	const seen = new Set<string>();

	const add = (candidate: ObjectiveCommandCandidate) => {
		const key = JSON.stringify(candidate);
		if (!seen.has(key)) {
			seen.add(key);
			candidates.push(candidate);
		}
	};

	const venvRoot = findAncestorContaining(cwd, join(".venv", "bin", "objective"));
	if (venvRoot) {
		add({ command: join(venvRoot, ".venv", "bin", "objective"), prefixArgs: [] });
	}

	add({ command: "objective", prefixArgs: [] });

	const projectRoot = findAncestorContaining(cwd, "pyproject.toml");
	if (projectRoot) {
		add({ command: "uv", prefixArgs: ["run", "--directory", projectRoot, "objective"] });
	}

	return candidates;
}

function parseClinkrEnvelope(stdout: string): ClinkrEnvelope<unknown> {
	const trimmed = stdout.trim();
	if (trimmed.length === 0) {
		throw new Error("Command returned no JSON output.");
	}

	const payload = JSON.parse(trimmed) as unknown;
	if (!isRecord(payload) || typeof payload.exit_code !== "number") {
		throw new Error("Command did not return a clinkr JSON envelope.");
	}
	return payload as ClinkrEnvelope<unknown>;
}

async function runObjectiveJson(pi: ExtensionAPI, ctx: ExtensionCommandContext, objectiveArgs: string[]): Promise<ObjectiveRun> {
	const failures: string[] = [];

	for (const candidate of resolveObjectiveCommandCandidates(ctx.cwd)) {
		const args = [...candidate.prefixArgs, ...objectiveArgs];
		const commandText = formatCommand([candidate.command, ...args]);
		try {
			const result = await pi.exec(candidate.command, args, {
				cwd: ctx.cwd,
				timeout: DEFAULT_TIMEOUT_MS,
			});
			try {
				return { commandText, envelope: parseClinkrEnvelope(result.stdout) };
			} catch (error) {
				const stdout = summarizeOutput(result.stdout);
				const stderr = summarizeOutput(result.stderr);
				failures.push(`${commandText}: ${messageFromUnknown(error)}${stderr ? `; stderr: ${stderr}` : ""}${stdout ? `; stdout: ${stdout}` : ""}`);
			}
		} catch (error) {
			failures.push(`${commandText}: ${messageFromUnknown(error)}`);
		}
	}

	throw new Error(`Unable to run objective CLI. Tried: ${failures.join(" | ")}`);
}

function requireSuccessfulEnvelope<T>(run: ObjectiveRun, label: string): T {
	const envelope = run.envelope as ClinkrEnvelope<T>;
	if (envelope.exit_code !== 0) {
		const reason = envelope.error_type ? `${envelope.error_type}: ` : "";
		throw new Error(`${label} failed: ${reason}${envelope.message ?? `exit_code=${envelope.exit_code}`}`);
	}
	if (envelope.data === undefined) {
		throw new Error(`${label} returned no data.`);
	}
	return envelope.data;
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
	return value === undefined || value === null || typeof value === "string";
}

function isCarriedFile(value: unknown): value is CarriedFile {
	return isRecord(value) && typeof value.file === "string" && (value.key === undefined || typeof value.key === "string");
}

function isClaimApplyResult(value: unknown): value is ClaimApplyResult {
	return (
		isRecord(value) &&
		typeof value.slug === "string" &&
		typeof value.target_branch === "string" &&
		isOptionalNullableString(value.source_branch) &&
		typeof value.source_label === "string" &&
		Array.isArray(value.files_carried) &&
		value.files_carried.every(isCarriedFile) &&
		typeof value.destination_ref === "string" &&
		typeof value.destination_commit_sha === "string"
	);
}

function isClaimSelectionOption(value: unknown): value is ClaimSelectionOption {
	return (
		isRecord(value) &&
		typeof value.label === "string" &&
		typeof value.value === "string" &&
		isOptionalNullableString(value.description) &&
		Array.isArray(value.rerun_args) &&
		value.rerun_args.every((arg) => typeof arg === "string")
	);
}

function isClaimSelection(value: unknown): value is ClaimSelection {
	return (
		isRecord(value) &&
		typeof value.kind === "string" &&
		typeof value.prompt === "string" &&
		Array.isArray(value.options) &&
		value.options.every(isClaimSelectionOption)
	);
}

function isClaimBlock(value: unknown): value is ClaimBlock {
	return isRecord(value) && typeof value.reason === "string" && typeof value.message === "string";
}

function isClaimCommandResult(value: unknown): value is ClaimCommandResult {
	return (
		isRecord(value) &&
		typeof value.schema === "string" &&
		typeof value.status === "string" &&
		typeof value.message === "string" &&
		(value.result === undefined || value.result === null || isClaimApplyResult(value.result)) &&
		(value.selection === undefined || value.selection === null || isClaimSelection(value.selection)) &&
		(value.block === undefined || value.block === null || isClaimBlock(value.block))
	);
}

async function loadClaim(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: string[]): Promise<ClaimCommandResult> {
	const run = await runObjectiveJson(pi, ctx, ["exec", "claim", ...args, "--format", "json"]);
	const data = requireSuccessfulEnvelope<unknown>(run, "claim");
	if (!isClaimCommandResult(data)) {
		throw new Error("claim returned data that does not match the expected shape.");
	}
	return data;
}

function emitMessage(pi: ExtensionAPI, content: string, details: Record<string, unknown> = {}): void {
	pi.sendMessage({
		customType: CUSTOM_TYPE,
		content,
		display: true,
		details,
	});
}

async function resolveSelection(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	result: ClaimCommandResult,
): Promise<{ args: string[]; result: ClaimCommandResult } | string> {
	const selection = result.selection;
	if (!selection || selection.options.length === 0) {
		return result.message;
	}

	if (!ctx.hasUI) {
		return result.message;
	}

	const selected = await ctx.ui.select(
		selection.prompt,
		selection.options.map((option) => option.label),
	);
	if (!selected) {
		return "Objective claim cancelled.";
	}

	const option = selection.options.find((candidate) => candidate.label === selected);
	if (!option) {
		return "Objective claim cancelled.";
	}

	return { args: option.rerun_args, result: await loadClaim(pi, ctx, option.rerun_args) };
}

export async function runObjectiveClaim(pi: ExtensionAPI, ctx: ExtensionCommandContext, argsText: string): Promise<void> {
	if (ctx.hasUI) {
		ctx.ui.setStatus(STATUS_KEY, "Claiming objective…");
	}

	try {
		let args = sanitizeArgs(argsText);
		let result = await loadClaim(pi, ctx, args);

		for (let attempts = 0; result.status === "needs_selection" && attempts < 3; attempts += 1) {
			const resolved = await resolveSelection(pi, ctx, result);
			if (typeof resolved === "string") {
				emitMessage(pi, resolved, { status: "needs_selection", selection: result.selection });
				if (ctx.hasUI) ctx.ui.notify(resolved.split("\n")[0] ?? resolved, "warning");
				return;
			}
			args = resolved.args;
			result = resolved.result;
		}

		if (result.status === "needs_selection") {
			emitMessage(pi, result.message, { status: "needs_selection", selection: result.selection });
			if (ctx.hasUI) ctx.ui.notify(result.message.split("\n")[0] ?? result.message, "warning");
			return;
		}

		if (result.status === "blocked") {
			emitMessage(pi, result.message, { status: "blocked", block: result.block });
			if (ctx.hasUI) ctx.ui.notify(result.message.split("\n")[0] ?? result.message, "error");
			return;
		}

		if (result.status !== "claimed") {
			throw new Error(`claim returned unsupported status: ${result.status}`);
		}

		if (!result.result) {
			throw new Error("claim returned status='claimed' without result details.");
		}

		emitMessage(pi, result.message, { status: "claimed", result: result.result, args });
		if (ctx.hasUI) {
			ctx.ui.notify(`Claimed objective: ${result.result.slug}`, "info");
		}
	} catch (error) {
		const message = `Objective claim failed: ${messageFromUnknown(error)}`;
		emitMessage(pi, message, { status: "failed" });
		if (ctx.hasUI) {
			ctx.ui.notify(message, "error");
		}
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
		}
	}
}

export function registerObjectiveClaim(pi: ExtensionAPI): void {
	pi.registerCommand("objective-claim", {
		description: "Claim an objective snapshot onto the current branch",
		handler: (argsText, ctx) => runObjectiveClaim(pi, ctx, argsText),
	});
}
