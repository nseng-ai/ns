import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

const STATUS_KEY = "objective-next";
const CUSTOM_TYPE = "objective-next";
const DEFAULT_TIMEOUT_MS = 30_000;

export type NextContextResult = {
	current_branch: string;
	trunk_branch: string;
	on_trunk: boolean;
	slug: string;
	files_present: string[];
	freshness: string | null;
	freshness_advisory: string | null;
	notes_present: boolean;
	body_content: string;
	roadmap_content: string | null;
	notes_content: string | null;
};

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

type ParsedArgs = {
	slug?: string | undefined;
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

function parseArgs(argsText: string): ParsedArgs {
	const tokens = splitArgs(argsText);
	let slug: string | undefined;

	for (const token of tokens) {
		const flag = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
		if (flag.startsWith("-")) {
			if (flag === "-h" || flag === "--help") {
				throw new Error("Usage: /objective-next [slug]. Flags are intentionally unsupported.");
			}
			throw new Error(`Unsupported flag for /objective-next: ${flag}`);
		}
		if (slug !== undefined) {
			throw new Error("/objective-next accepts at most one slug positional.");
		}
		slug = token;
	}

	return { slug };
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

function requireSuccessfulEnvelope<T>(envelope: ClinkrEnvelope<unknown>, label: string): T {
	if (envelope.exit_code !== 0) {
		const reason = envelope.error_type ? `${envelope.error_type}: ` : "";
		throw new Error(`${label} failed: ${reason}${envelope.message ?? `exit_code=${envelope.exit_code}`}`);
	}
	if (envelope.data === undefined) {
		throw new Error(`${label} returned no data.`);
	}
	return envelope.data as T;
}

function isNextContextResult(value: unknown): value is NextContextResult {
	return (
		isRecord(value) &&
		typeof value.current_branch === "string" &&
		typeof value.trunk_branch === "string" &&
		typeof value.on_trunk === "boolean" &&
		typeof value.slug === "string" &&
		Array.isArray(value.files_present) &&
		value.files_present.every((file) => typeof file === "string") &&
		(value.freshness === null || typeof value.freshness === "string") &&
		(value.freshness_advisory === null || typeof value.freshness_advisory === "string") &&
		typeof value.notes_present === "boolean" &&
		typeof value.body_content === "string" &&
		(value.roadmap_content === null || typeof value.roadmap_content === "string") &&
		(value.notes_content === null || typeof value.notes_content === "string")
	);
}

async function loadNextContext(pi: ExtensionAPI, ctx: ExtensionCommandContext, slug: string | undefined): Promise<NextContextResult> {
	const args = ["exec", "next-context", ...(slug ? [slug] : []), "--format", "json"];
	const failures: string[] = [];

	for (const candidate of resolveObjectiveCommandCandidates(ctx.cwd)) {
		const finalArgs = [...candidate.prefixArgs, ...args];
		const commandText = formatCommand([candidate.command, ...finalArgs]);
		let result: { stdout: string; stderr: string; code: number };
		try {
			result = await pi.exec(candidate.command, finalArgs, {
				cwd: ctx.cwd,
				timeout: DEFAULT_TIMEOUT_MS,
			});
		} catch (error) {
			failures.push(`${commandText}: ${messageFromUnknown(error)}`);
			continue;
		}

		let envelope: ClinkrEnvelope<unknown>;
		try {
			envelope = parseClinkrEnvelope(result.stdout);
		} catch (error) {
			const stdout = summarizeOutput(result.stdout);
			const stderr = summarizeOutput(result.stderr);
			failures.push(`${commandText}: ${messageFromUnknown(error)}${stderr ? `; stderr: ${stderr}` : ""}${stdout ? `; stdout: ${stdout}` : ""}`);
			continue;
		}

		const data = requireSuccessfulEnvelope<unknown>(envelope, "objective exec next-context");
		if (!isNextContextResult(data)) {
			throw new Error("objective exec next-context returned data that does not match the expected schema.");
		}
		return data;
	}

	throw new Error(`Unable to run objective exec next-context. Tried: ${failures.join(" | ")}`);
}

function formatNullable(value: string | null): string {
	return value ?? "skipped";
}

function formatBoolean(value: boolean): string {
	return value ? "true" : "false";
}

function formatContentSection(fileName: string, content: string | null): string[] {
	if (content === null) {
		return [`## ${fileName}`, "", "_Not present._"];
	}
	return [`## ${fileName}`, "", content.trimEnd()];
}

function buildReport(result: NextContextResult): string {
	const files = result.files_present.length > 0 ? result.files_present.join(", ") : "none";
	const notes = result.notes_present ? "present" : "none";
	const lines: string[] = [
		`# Objective next context: \`${result.slug}\``,
		"",
		"## Dashboard",
		"",
		`Current branch: \`${result.current_branch}\``,
		`Trunk branch: \`${result.trunk_branch}\``,
		`On trunk: ${formatBoolean(result.on_trunk)}`,
		`Files: ${files}`,
		`Freshness: ${formatNullable(result.freshness)}`,
		`Notes: ${notes}`,
	];

	if (result.freshness_advisory !== null) {
		lines.push(`Advisory: ${result.freshness_advisory}`);
	}

	lines.push(
		"",
		...formatContentSection("body.md", result.body_content),
		"",
		...formatContentSection("roadmap.md", result.roadmap_content),
		"",
		...formatContentSection("notes.md", result.notes_content),
		"",
		"## Next step",
		"",
		"Semantic next-slice choice belongs to the agent/skill, not the Pi renderer. Use the context above to choose the next PR-sized slice.",
	);

	return lines.join("\n");
}

function emitMessage(pi: ExtensionAPI, content: string, details: Record<string, unknown> = {}): void {
	pi.sendMessage({
		customType: CUSTOM_TYPE,
		content,
		display: true,
		details,
	});
}

export async function runObjectiveNext(pi: ExtensionAPI, ctx: ExtensionCommandContext, argsText: string): Promise<void> {
	if (ctx.hasUI) {
		ctx.ui.setStatus(STATUS_KEY, "Loading objective context…");
	}

	try {
		const args = parseArgs(argsText);
		const result = await loadNextContext(pi, ctx, args.slug);
		const report = buildReport(result);

		emitMessage(pi, report, {
			status: "ok",
			slug: result.slug,
			branch: result.current_branch,
			trunk: result.trunk_branch,
			files: result.files_present,
			freshness: result.freshness,
		});
		if (ctx.hasUI) {
			ctx.ui.notify(`Objective next context: ${result.slug}`, "info");
		}
	} catch (error) {
		const message = `Objective next failed: ${messageFromUnknown(error)}`;
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

export function registerObjectiveNext(pi: ExtensionAPI): void {
	pi.registerCommand("objective-next", {
		description: "Inspect objective-next context for the current branch",
		handler: (argsText, ctx) => runObjectiveNext(pi, ctx, argsText),
	});
}
