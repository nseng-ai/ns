import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

const STATUS_KEY = "objective-next";
const CUSTOM_TYPE = "objective-next";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_SLUG_LENGTH = 50;

type CommandCandidate = {
	command: string;
	prefixArgs: string[];
};

type ClinkrEnvelope<T> = {
	exit_code: number;
	data?: T;
	error_type?: string;
	message?: string;
};

type FreshnessState = "fresh" | "stale";

type NextContextResult = {
	current_branch: string;
	trunk_branch: string;
	on_trunk: boolean;
	slug: string;
	files_present: string[];
	freshness: FreshnessState | null;
	freshness_advisory: string | null;
	notes_present: boolean;
	body_content: string;
	roadmap_content: string | null;
	notes_content: string | null;
};

type ParsedArgs = {
	slug?: string | undefined;
};

type ChecklistItem = {
	checked: boolean;
	text: string;
	section?: string | undefined;
};

type NextWork = {
	heading?: string;
	itemText?: string;
	basis: string;
};

type ParsedContent = {
	title: string;
	status: string;
	descriptionSummary?: string | undefined;
	roadmapChecked: number;
	roadmapUnchecked: number;
	nextWork?: NextWork | undefined;
};

type CollisionContext = {
	trunkBranch: string;
};

type CollisionResult = {
	branchExists: boolean;
	canonicalExists: boolean;
	warnings: string[];
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

function resolveCommandCandidates(commandName: string, cwd: string): CommandCandidate[] {
	const candidates: CommandCandidate[] = [];
	const seen = new Set<string>();

	const add = (candidate: CommandCandidate) => {
		const key = JSON.stringify(candidate);
		if (!seen.has(key)) {
			seen.add(key);
			candidates.push(candidate);
		}
	};

	const venvRoot = findAncestorContaining(cwd, join(".venv", "bin", commandName));
	if (venvRoot) {
		add({ command: join(venvRoot, ".venv", "bin", commandName), prefixArgs: [] });
	}

	add({ command: commandName, prefixArgs: [] });

	const projectRoot = findAncestorContaining(cwd, "pyproject.toml");
	if (projectRoot) {
		add({ command: "uv", prefixArgs: ["run", "--directory", projectRoot, commandName] });
	}

	return candidates;
}

async function runJson<T>(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	command: string,
	args: string[],
	label: string,
): Promise<T> {
	const failures: string[] = [];

	for (const candidate of resolveCommandCandidates(command, ctx.cwd)) {
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

		return requireSuccessfulEnvelope<T>(envelope, label);
	}

	throw new Error(`Unable to run ${label}. Tried: ${failures.join(" | ")}`);
}

async function runCommandFirstAvailable(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	command: string,
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string; commandText: string }> {
	const failures: string[] = [];

	for (const candidate of resolveCommandCandidates(command, ctx.cwd)) {
		const finalArgs = [...candidate.prefixArgs, ...args];
		const commandText = formatCommand([candidate.command, ...finalArgs]);
		try {
			const result = await pi.exec(candidate.command, finalArgs, {
				cwd: ctx.cwd,
				timeout: DEFAULT_TIMEOUT_MS,
			});
			return { code: result.code, stdout: result.stdout, stderr: result.stderr, commandText };
		} catch (error) {
			failures.push(`${commandText}: ${messageFromUnknown(error)}`);
		}
	}

	throw new Error(`Unable to run ${command}. Tried: ${failures.join(" | ")}`);
}

function parseArgs(argsText: string): ParsedArgs {
	const tokens = splitArgs(argsText);
	let slug: string | undefined;

	for (const token of tokens) {
		const flag = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
		if (
			flag === "--format" ||
			flag === "--schema" ||
			flag === "--from" ||
			flag === "--from-file" ||
			flag === "--branch" ||
			flag === "--source" ||
			flag === "-h" ||
			flag === "--help"
		) {
			throw new Error("Usage: /objective-next [slug]. Source and format flags are intentionally unsupported.");
		}
		if (token.startsWith("--")) {
			throw new Error(`Unsupported flag for /objective-next: ${flag}`);
		}
		if (slug !== undefined) {
			throw new Error("/objective-next accepts at most one slug positional.");
		}
		slug = token;
	}

	return { slug };
}

function isFreshnessState(value: unknown): value is FreshnessState {
	return value === "fresh" || value === "stale";
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === "string";
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
		(value.freshness === null || isFreshnessState(value.freshness)) &&
		isNullableString(value.freshness_advisory) &&
		typeof value.notes_present === "boolean" &&
		typeof value.body_content === "string" &&
		isNullableString(value.roadmap_content) &&
		isNullableString(value.notes_content)
	);
}

async function loadNextContext(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: ParsedArgs): Promise<NextContextResult> {
	const data = await runJson<unknown>(
		pi,
		ctx,
		"objective",
		["exec", "next-context", ...(args.slug ? [args.slug] : []), "--format", "json"],
		"objective exec next-context",
	);
	if (!isNextContextResult(data)) {
		throw new Error("objective exec next-context returned data that does not match the expected schema.");
	}
	return data;
}

async function runGit(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
	return pi.exec("git", args, { cwd: ctx.cwd, timeout: DEFAULT_TIMEOUT_MS });
}

function firstHeading(markdown: string): string | undefined {
	for (const line of markdown.split("\n")) {
		const match = line.match(/^#\s+(.+)\s*$/);
		if (match?.[1]) {
			return cleanupInlineMarkdown(match[1]);
		}
	}
	return undefined;
}

function statusLine(markdown: string): string | undefined {
	for (const line of markdown.split("\n")) {
		const match = line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?Status(?:\*\*)?\s*:?\s*(.+?)\s*$/i);
		if (match?.[1]) {
			return cleanupInlineMarkdown(match[1]);
		}
	}
	return undefined;
}

function extractSection(markdown: string, sectionName: string): string | undefined {
	const lines = markdown.split("\n");
	let capturing = false;
	const content: string[] = [];
	for (const line of lines) {
		const heading = line.match(/^(#{2,6})\s+(.+)\s*$/);
		if (heading) {
			if (capturing) break;
			capturing = cleanupInlineMarkdown(heading[2] ?? "").toLowerCase() === sectionName.toLowerCase();
			continue;
		}
		if (capturing) {
			content.push(line);
		}
	}
	return capturing || content.length > 0 ? content.join("\n") : undefined;
}

function firstParagraph(section: string | undefined): string | undefined {
	if (!section) return undefined;
	const paragraphs = section
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph.length > 0 && !paragraph.startsWith("- "));
	const paragraph = paragraphs[0];
	if (!paragraph) return undefined;
	return truncateText(cleanupInlineMarkdown(paragraph.replace(/\s+/g, " ")), 220);
}

function cleanupInlineMarkdown(value: string): string {
	return value
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/[*_~]/g, "")
		.trim();
}

function parseChecklistItems(markdown: string): ChecklistItem[] {
	const items: ChecklistItem[] = [];
	let currentSection: string | undefined;
	for (const line of markdown.split("\n")) {
		const heading = line.match(/^##\s+(.+)\s*$/);
		if (heading?.[1]) {
			currentSection = cleanupInlineMarkdown(heading[1]);
			continue;
		}
		const item = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)\s*$/);
		if (item?.[1] && item[2]) {
			items.push({
				checked: item[1].toLowerCase() === "x",
				text: cleanupInlineMarkdown(item[2]),
				section: currentSection,
			});
		}
	}
	return items;
}

function findNextRoadmapWork(roadmap: string | undefined): NextWork | undefined {
	if (!roadmap) return undefined;
	const items = parseChecklistItems(roadmap);
	const sectionOrder: string[] = [];
	for (const item of items) {
		if (item.section && !sectionOrder.includes(item.section)) {
			sectionOrder.push(item.section);
		}
	}
	for (const section of sectionOrder) {
		const unchecked = items.find((item) => item.section === section && !item.checked);
		if (unchecked) {
			return {
				heading: section,
				itemText: unchecked.text,
				basis: `first unchecked roadmap item under "${section}"`,
			};
		}
	}
	const unchecked = items.find((item) => !item.checked);
	if (unchecked) {
		return {
			itemText: unchecked.text,
			basis: "first unchecked roadmap item",
		};
	}
	return undefined;
}

function findBodyCompletionWork(body: string): NextWork | undefined {
	const section = extractSection(body, "Completion Criteria");
	if (!section) return undefined;
	const unchecked = parseChecklistItems(section).find((item) => !item.checked);
	if (!unchecked) return undefined;
	return {
		itemText: unchecked.text,
		basis: "first unchecked body completion criterion",
	};
}

function parseContent(context: NextContextResult): ParsedContent {
	const body = context.body_content;
	const roadmap = context.roadmap_content ?? undefined;
	const roadmapItems = roadmap ? parseChecklistItems(roadmap) : [];
	const nextWork = findNextRoadmapWork(roadmap) ?? findBodyCompletionWork(body);

	return {
		title: firstHeading(body) ?? context.slug,
		status: statusLine(body) ?? "unknown",
		descriptionSummary: firstParagraph(extractSection(body, "Description")),
		roadmapChecked: roadmapItems.filter((item) => item.checked).length,
		roadmapUnchecked: roadmapItems.filter((item) => !item.checked).length,
		nextWork,
	};
}

function truncateText(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}
	return `${value.slice(0, Math.max(0, maxLength - 1)).replace(/\s+\S*$/, "")}…`;
}

function stripSlugPrefixNoise(value: string): string {
	return value
		.replace(/^\s*(?:slice|roadmap item)\s*\d+[.)\-:—–]*\s*/i, "")
		.replace(/^\s*\d+[.)\-:—–]+\s*/, "")
		.replace(/\bobjective\b/gi, "")
		.trim();
}

function sanitizeSuggestedSlug(value: string): string | undefined {
	const slug = stripSlugPrefixNoise(value)
		.replace(/#[0-9]+\b/g, "")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/[*_~]/g, "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.replace(/^objective-+/, "")
		.replace(/\.md$/i, "");

	const trimmed = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
	return trimmed || undefined;
}

function generateSuggestedSlug(parentSlug: string, content: ParsedContent): string | undefined {
	const candidates = [content.nextWork?.heading, content.nextWork?.itemText, content.title].filter((value): value is string => Boolean(value));
	for (const candidate of candidates) {
		const slug = sanitizeSuggestedSlug(candidate);
		if (slug && slug !== parentSlug) {
			return slug;
		}
	}
	if (content.nextWork?.heading && content.nextWork.itemText) {
		const combined = sanitizeSuggestedSlug(`${content.nextWork.heading} ${content.nextWork.itemText}`);
		if (combined && combined !== parentSlug) {
			return combined;
		}
	}
	return undefined;
}

async function checkCollisions(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	context: CollisionContext,
	suggestedSlug: string,
): Promise<CollisionResult> {
	const warnings: string[] = [];
	const branchCheck = await runGit(pi, ctx, ["rev-parse", "--verify", "--quiet", `refs/heads/${suggestedSlug}`]);
	const branchExists = branchCheck.code === 0;

	let canonicalExists = false;
	try {
		const check = await runCommandFirstAvailable(pi, ctx, "brmem", [
			"check",
			`${suggestedSlug}/body.md`,
			"--namespace",
			"objectives",
			"--branch",
			context.trunkBranch,
			"--format",
			"json",
		]);
		let exitCode = check.code;
		if (check.stdout.trim().length > 0) {
			try {
				exitCode = parseClinkrEnvelope(check.stdout).exit_code;
			} catch (error) {
				warnings.push(`Canonical collision check returned unparseable JSON: ${messageFromUnknown(error)}`);
			}
		}
		if (exitCode === 0) {
			canonicalExists = true;
		} else if (exitCode !== 1) {
			warnings.push(`Canonical collision check exited ${exitCode}: ${summarizeOutput(check.stderr) || summarizeOutput(check.stdout)}`);
		}
	} catch (error) {
		warnings.push(`Canonical collision check failed: ${messageFromUnknown(error)}`);
	}

	return { branchExists, canonicalExists, warnings };
}

function formatCollision(collision: CollisionResult | undefined): string {
	if (!collision) {
		return "Collision check: not run";
	}
	const lines: string[] = [];
	if (collision.branchExists) {
		lines.push("Collision: local branch exists");
	}
	if (collision.canonicalExists) {
		lines.push("Collision: canonical objective exists");
	}
	for (const warning of collision.warnings) {
		lines.push(`Collision warning: ${warning}`);
	}
	if (lines.length === 0) {
		return "Collision check: clear";
	}
	return lines.join("\n");
}

function formatFreshness(context: NextContextResult): string {
	return context.freshness ?? "skipped";
}

function buildReport(input: {
	context: NextContextResult;
	content: ParsedContent;
	suggestedSlug?: string | undefined;
	collision?: CollisionResult | undefined;
}): string {
	const files = input.context.files_present;
	const notesState = input.context.notes_present ? "present" : "none";
	const basis = input.content.nextWork?.basis ?? "no obvious open roadmap item";
	const suggested = input.suggestedSlug ? `\`${input.suggestedSlug}\`` : "unable to generate a safe slug";
	const lines: string[] = [];

	if (input.context.freshness === "stale") {
		lines.push(
			`> ${input.context.freshness_advisory ?? `Snapshot is stale. Consider running \`objective-update ${input.context.slug}\` before creating the next slice branch.`}`,
			"",
		);
	}

	lines.push(
		`# Objective next: \`${input.context.slug}\``,
		"",
		`Source: current branch \`${input.context.current_branch}\``,
		`Trunk: \`${input.context.trunk_branch}\``,
		`On trunk: ${input.context.on_trunk ? "yes" : "no"}`,
		`Files: ${files.join(", ") || "none"}`,
		"",
		"## Status",
		"",
		`Title: ${input.content.title}`,
		`Status: ${input.content.status}`,
		`Progress: ${input.content.roadmapChecked} checked, ${input.content.roadmapUnchecked} open`,
		`Notes: ${notesState}`,
		`Freshness: ${formatFreshness(input.context)}`,
	);
	if (input.content.descriptionSummary) {
		lines.push(`Description: ${input.content.descriptionSummary}`);
	}
	if (input.context.freshness_advisory) {
		lines.push(`Advisory: ${input.context.freshness_advisory}`);
	}

	lines.push(
		"",
		"## Suggested next slice",
		"",
		`Suggested slug: ${suggested}`,
		`Basis: ${basis}`,
		"",
		formatCollision(input.collision),
		"",
		"## Next step",
		"",
	);

	if (input.suggestedSlug) {
		lines.push(
			`To proceed: write a plan file using \`${input.suggestedSlug}\`, run \`brmem-branch-create\`, navigate to the new branch, then run \`objective-claim ${input.context.slug}\`.`,
		);
	} else {
		lines.push("To proceed: choose a PR-sized slice manually, then write a plan file for it before creating a branch.");
	}
	lines.push(`After implementing the slice, merge the PR and run \`objective-reconcile ${input.context.slug}\` on \`${input.context.trunk_branch}\`.`);

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
		ctx.ui.setStatus(STATUS_KEY, "Inspecting objective…");
	}

	try {
		const args = parseArgs(argsText);
		const context = await loadNextContext(pi, ctx, args);
		const content = parseContent(context);
		const suggestedSlug = generateSuggestedSlug(context.slug, content);
		const collision = suggestedSlug ? await checkCollisions(pi, ctx, { trunkBranch: context.trunk_branch }, suggestedSlug) : undefined;
		const report = buildReport({
			context,
			content,
			suggestedSlug,
			collision,
		});

		emitMessage(pi, report, {
			status: "ok",
			slug: context.slug,
			suggestedSlug,
			branch: context.current_branch,
			trunk: context.trunk_branch,
			freshness: context.freshness,
			collision,
		});
		if (ctx.hasUI) {
			ctx.ui.notify(`Objective next: ${context.slug}`, "info");
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
		description: "Inspect an objective and suggest the next PR-sized slice",
		handler: (argsText, ctx) => runObjectiveNext(pi, ctx, argsText),
	});
}
