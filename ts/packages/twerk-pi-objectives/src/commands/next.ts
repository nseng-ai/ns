import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

const STATUS_KEY = "objective-next";
const CUSTOM_TYPE = "objective-next";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_SLUG_LENGTH = 50;
const KNOWN_FILES = ["body.md", "roadmap.md", "notes.md"] as const;

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

type BranchPresence = {
	branch: string;
	deleted: boolean;
};

type RepoObjective = {
	slug: string;
	files: string[];
	canonical_present: boolean;
	state: string;
	branches: BranchPresence[];
};

type BranchEntry = {
	namespace: string;
	key: string;
	branch: string;
	ref_name: string;
};

type RepoListData = {
	scope: "repo";
	objectives: RepoObjective[];
};

type BranchListData = {
	branch: string;
	slugs: string[];
	entries: BranchEntry[];
};

type ObjectiveFile = {
	source_branch: string;
	content: string;
};

type ObjectiveShowResult = {
	slug: string;
	canonical_present: boolean;
	canonical_trunk: string;
	state: string;
	closed_at: string | null;
	closed_reason: string | null;
	branches: BranchPresence[];
	files: string[];
	body: ObjectiveFile | null;
	roadmap: ObjectiveFile | null;
	notes: ObjectiveFile | null;
};

type UpdatePrecheckResult = {
	freshness?: string;
	absorbed_marker_diagnostics?: string[];
};

type ParsedArgs = {
	slug?: string | undefined;
};

type GitContext = {
	repoRoot: string;
	currentBranch: string;
	trunkBranch: string;
	onTrunk: boolean;
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

function resolveCommandCandidates(commandName: string, repoRoot: string): CommandCandidate[] {
	const candidates: CommandCandidate[] = [];
	const seen = new Set<string>();

	const add = (candidate: CommandCandidate) => {
		const key = JSON.stringify(candidate);
		if (!seen.has(key)) {
			seen.add(key);
			candidates.push(candidate);
		}
	};

	const venvCommand = join(repoRoot, ".venv", "bin", commandName);
	if (existsSync(venvCommand)) {
		add({ command: venvCommand, prefixArgs: [] });
	}

	add({ command: commandName, prefixArgs: [] });

	if (existsSync(join(repoRoot, "pyproject.toml"))) {
		add({ command: "uv", prefixArgs: ["run", "--directory", repoRoot, commandName] });
	}

	return candidates;
}

async function runJson<T>(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	command: string,
	args: string[],
	label: string,
	repoRoot: string,
): Promise<T> {
	const failures: string[] = [];

	for (const candidate of resolveCommandCandidates(command, repoRoot)) {
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
	repoRoot: string,
): Promise<{ code: number; stdout: string; stderr: string; commandText: string }> {
	const failures: string[] = [];

	for (const candidate of resolveCommandCandidates(command, repoRoot)) {
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

async function runGit(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
	return pi.exec("git", args, { cwd: ctx.cwd, timeout: DEFAULT_TIMEOUT_MS });
}

async function requireGitStdout(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: string[], label: string): Promise<string> {
	const result = await runGit(pi, ctx, args);
	if (result.code !== 0) {
		throw new Error(`${label} failed: ${result.stderr.trim() || result.stdout.trim() || `git exited ${result.code}`}`);
	}
	return result.stdout.trim();
}

async function resolveGitContext(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<GitContext> {
	let repoRoot: string;
	try {
		repoRoot = await requireGitStdout(pi, ctx, ["rev-parse", "--show-toplevel"], "git repo preflight");
	} catch (error) {
		throw new Error(`Not in a git repository: ${messageFromUnknown(error)}`);
	}

	const currentBranch = await requireGitStdout(pi, ctx, ["rev-parse", "--abbrev-ref", "HEAD"], "current branch preflight");
	if (currentBranch === "HEAD") {
		throw new Error("Detached HEAD: /objective-next requires a checked-out branch.");
	}

	const originHead = await runGit(pi, ctx, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
	let trunkBranch = originHead.code === 0 ? originHead.stdout.trim().replace(/^origin\//, "") : "";
	if (!trunkBranch) {
		const main = await runGit(pi, ctx, ["rev-parse", "--verify", "--quiet", "refs/heads/main"]);
		if (main.code === 0) {
			trunkBranch = "main";
		} else {
			const master = await runGit(pi, ctx, ["rev-parse", "--verify", "--quiet", "refs/heads/master"]);
			trunkBranch = master.code === 0 ? "master" : "master";
		}
	}

	return {
		repoRoot,
		currentBranch,
		trunkBranch,
		onTrunk: currentBranch === trunkBranch,
	};
}

function isBranchPresence(value: unknown): value is BranchPresence {
	return isRecord(value) && typeof value.branch === "string" && typeof value.deleted === "boolean";
}

function isRepoObjective(value: unknown): value is RepoObjective {
	return (
		isRecord(value) &&
		typeof value.slug === "string" &&
		Array.isArray(value.files) &&
		value.files.every((file) => typeof file === "string") &&
		typeof value.canonical_present === "boolean" &&
		typeof value.state === "string" &&
		Array.isArray(value.branches) &&
		value.branches.every(isBranchPresence)
	);
}

function isBranchEntry(value: unknown): value is BranchEntry {
	return (
		isRecord(value) &&
		typeof value.namespace === "string" &&
		typeof value.key === "string" &&
		typeof value.branch === "string" &&
		typeof value.ref_name === "string"
	);
}

function isRepoListData(value: unknown): value is RepoListData {
	return isRecord(value) && value.scope === "repo" && Array.isArray(value.objectives) && value.objectives.every(isRepoObjective);
}

function isBranchListData(value: unknown): value is BranchListData {
	return (
		isRecord(value) &&
		typeof value.branch === "string" &&
		Array.isArray(value.slugs) &&
		value.slugs.every((slug) => typeof slug === "string") &&
		Array.isArray(value.entries) &&
		value.entries.every(isBranchEntry)
	);
}

function isObjectiveFile(value: unknown): value is ObjectiveFile {
	return isRecord(value) && typeof value.source_branch === "string" && typeof value.content === "string";
}

function isObjectiveShowResult(value: unknown): value is ObjectiveShowResult {
	return (
		isRecord(value) &&
		typeof value.slug === "string" &&
		typeof value.canonical_present === "boolean" &&
		typeof value.canonical_trunk === "string" &&
		typeof value.state === "string" &&
		(value.closed_at === null || typeof value.closed_at === "string") &&
		(value.closed_reason === null || typeof value.closed_reason === "string") &&
		Array.isArray(value.branches) &&
		value.branches.every(isBranchPresence) &&
		Array.isArray(value.files) &&
		value.files.every((file) => typeof file === "string") &&
		(value.body === null || isObjectiveFile(value.body)) &&
		(value.roadmap === null || isObjectiveFile(value.roadmap)) &&
		(value.notes === null || isObjectiveFile(value.notes))
	);
}

function isUpdatePrecheckResult(value: unknown): value is UpdatePrecheckResult {
	return (
		isRecord(value) &&
		(value.freshness === undefined || typeof value.freshness === "string") &&
		(value.absorbed_marker_diagnostics === undefined ||
			(Array.isArray(value.absorbed_marker_diagnostics) && value.absorbed_marker_diagnostics.every((entry) => typeof entry === "string")))
	);
}

async function loadRepoObjectives(pi: ExtensionAPI, ctx: ExtensionCommandContext, git: GitContext): Promise<RepoObjective[]> {
	const data = await runJson<unknown>(pi, ctx, "objective", ["list", "--format", "json"], "objective list", git.repoRoot);
	if (!isRepoListData(data)) {
		throw new Error("objective list returned data that does not match the repo-list schema.");
	}
	return data.objectives;
}

async function loadBranchList(pi: ExtensionAPI, ctx: ExtensionCommandContext, git: GitContext): Promise<BranchListData> {
	const data = await runJson<unknown>(pi, ctx, "objective", ["list", "--here", "--format", "json"], "objective list --here", git.repoRoot);
	if (!isBranchListData(data)) {
		throw new Error("objective list --here returned data that does not match the branch-list schema.");
	}
	return data;
}

function canonicalOpenObjectives(objectives: RepoObjective[]): RepoObjective[] {
	return objectives.filter(
		(objective) => objective.state.trim().toLowerCase() === "open" && objective.canonical_present && objective.files.includes("body.md"),
	);
}

function branchSlugsWithBody(listData: BranchListData): string[] {
	const slugs = new Set<string>();
	for (const entry of listData.entries) {
		const slashIndex = entry.key.indexOf("/");
		if (slashIndex === -1) continue;
		const slug = entry.key.slice(0, slashIndex);
		const file = entry.key.slice(slashIndex + 1);
		if (file === "body.md") {
			slugs.add(slug);
		}
	}
	return [...slugs].sort();
}

async function chooseSlug(pi: ExtensionAPI, ctx: ExtensionCommandContext, git: GitContext, requestedSlug?: string): Promise<string | undefined> {
	if (git.onTrunk) {
		const objectives = canonicalOpenObjectives(await loadRepoObjectives(pi, ctx, git));
		const slugs = objectives.map((objective) => objective.slug).sort();
		if (requestedSlug) {
			if (!slugs.includes(requestedSlug)) {
				throw new Error(`objective ${requestedSlug} not canonical on ${git.trunkBranch}`);
			}
			return requestedSlug;
		}
		if (slugs.length === 0) {
			throw new Error("no canonical objectives; run objective-create to author one.");
		}
		if (slugs.length === 1) {
			return slugs[0];
		}
		if (!ctx.hasUI) {
			emitMessage(pi, `Multiple objectives available: ${slugs.join(", ")}.\nRun /objective-next <slug>.`, { status: "needs-selection", slugs });
			return undefined;
		}
		const selected = await ctx.ui.select("Choose objective", slugs);
		if (!selected) {
			emitMessage(pi, "Objective selection cancelled.", { status: "cancelled" });
			return undefined;
		}
		return selected;
	}

	const listData = await loadBranchList(pi, ctx, git);
	const slugs = branchSlugsWithBody(listData);
	if (requestedSlug) {
		if (!slugs.includes(requestedSlug)) {
			throw new Error(`slug ${requestedSlug} not claimed on ${git.currentBranch}; run objective-claim ${requestedSlug} first`);
		}
		return requestedSlug;
	}
	if (slugs.length === 0) {
		throw new Error("no objective claimed on this branch; run objective-claim to attach the parent's objective, or objective-create to start a new one.");
	}
	if (slugs.length === 1) {
		return slugs[0];
	}
	if (!ctx.hasUI) {
		emitMessage(pi, `Multiple objectives available: ${slugs.join(", ")}.\nRun /objective-next <slug>.`, { status: "needs-selection", slugs });
		return undefined;
	}
	const selected = await ctx.ui.select("Choose objective", slugs);
	if (!selected) {
		emitMessage(pi, "Objective selection cancelled.", { status: "cancelled" });
		return undefined;
	}
	return selected;
}

async function loadObjectiveShow(pi: ExtensionAPI, ctx: ExtensionCommandContext, git: GitContext, slug: string): Promise<ObjectiveShowResult> {
	const data = await runJson<unknown>(
		pi,
		ctx,
		"objective",
		["show", slug, "--branch", git.currentBranch, "--format", "json"],
		"objective show",
		git.repoRoot,
	);
	if (!isObjectiveShowResult(data)) {
		throw new Error("objective show returned data that does not match the expected schema.");
	}
	if (!data.body || data.body.content.trim().length === 0) {
		throw new Error(`objective ${slug} on ${git.currentBranch} has no nonempty body.md`);
	}
	return data;
}

async function loadFreshnessAdvisories(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	git: GitContext,
	slug: string,
): Promise<{ advisories: string[]; stale: boolean }> {
	if (git.onTrunk) {
		return { advisories: [], stale: false };
	}

	try {
		const data = await runJson<unknown>(
			pi,
			ctx,
			"objective",
			["exec", "update-precheck", slug, "--format", "json"],
			"objective update-precheck",
			git.repoRoot,
		);
		if (!isUpdatePrecheckResult(data)) {
			return { advisories: ["Freshness precheck returned an unexpected schema; continuing without freshness classification."], stale: false };
		}

		const diagnostics = data.absorbed_marker_diagnostics ?? [];
		const advisories: string[] = [];
		const stale = data.freshness === "stale";
		if (stale) {
			advisories.push(`Snapshot is behind HEAD on ${git.currentBranch} — consider running objective-update ${slug} first.`);
		}
		if (diagnostics.length > 0) {
			advisories.push(`Absorbed marker has ${diagnostics.length} diagnostic${diagnostics.length === 1 ? "" : "s"}; consider running objective-update ${slug} first.`);
		}
		return { advisories, stale: stale || diagnostics.length > 0 };
	} catch (error) {
		return { advisories: [`Freshness precheck failed: ${messageFromUnknown(error)}`], stale: false };
	}
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

function parseContent(show: ObjectiveShowResult): ParsedContent {
	const body = show.body?.content ?? "";
	const roadmap = show.roadmap?.content;
	const roadmapItems = roadmap ? parseChecklistItems(roadmap) : [];
	const nextWork = findNextRoadmapWork(roadmap) ?? findBodyCompletionWork(body);

	return {
		title: firstHeading(body) ?? show.slug,
		status: statusLine(body) ?? show.state,
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
	git: GitContext,
	suggestedSlug: string,
): Promise<CollisionResult> {
	const warnings: string[] = [];
	const branchCheck = await runGit(pi, ctx, ["rev-parse", "--verify", "--quiet", `refs/heads/${suggestedSlug}`]);
	const branchExists = branchCheck.code === 0;

	let canonicalExists = false;
	try {
		const check = await runCommandFirstAvailable(
			pi,
			ctx,
			"brmem",
			["check", `${suggestedSlug}/body.md`, "--namespace", "objectives", "--branch", git.trunkBranch, "--format", "json"],
			git.repoRoot,
		);
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

function presentFiles(show: ObjectiveShowResult): string[] {
	return KNOWN_FILES.filter((file) => {
		if (file === "body.md") return show.body !== null;
		if (file === "roadmap.md") return show.roadmap !== null;
		if (file === "notes.md") return show.notes !== null;
		return false;
	});
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

function buildReport(input: {
	slug: string;
	git: GitContext;
	show: ObjectiveShowResult;
	content: ParsedContent;
	advisories: string[];
	stale: boolean;
	suggestedSlug?: string | undefined;
	collision?: CollisionResult | undefined;
}): string {
	const files = presentFiles(input.show);
	const notesState = input.show.notes && input.show.notes.content.trim().length > 0 ? "present" : "none";
	const basis = input.content.nextWork?.basis ?? "no obvious open roadmap item";
	const suggested = input.suggestedSlug ? `\`${input.suggestedSlug}\`` : "unable to generate a safe slug";
	const lines: string[] = [];

	if (input.stale) {
		lines.push(`> Snapshot is stale. Consider running \`objective-update ${input.slug}\` before creating the next slice branch.`, "");
	}

	lines.push(
		`# Objective next: \`${input.slug}\``,
		"",
		`Source: current branch \`${input.git.currentBranch}\``,
		`Files: ${files.join(", ") || "none"}`,
		"",
		"## Status",
		"",
		`Title: ${input.content.title}`,
		`Status: ${input.content.status}`,
		`Progress: ${input.content.roadmapChecked} checked, ${input.content.roadmapUnchecked} open`,
		`Notes: ${notesState}`,
	);
	if (input.content.descriptionSummary) {
		lines.push(`Description: ${input.content.descriptionSummary}`);
	}
	for (const advisory of input.advisories) {
		lines.push(`Advisory: ${advisory}`);
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
			`To proceed: write a plan file using \`${input.suggestedSlug}\`, run \`brmem-branch-create\`, navigate to the new branch, then run \`objective-claim ${input.slug}\`.`,
		);
	} else {
		lines.push("To proceed: choose a PR-sized slice manually, then write a plan file for it before creating a branch.");
	}
	lines.push(`After implementing the slice, merge the PR and run \`objective-reconcile ${input.slug}\` on \`${input.git.trunkBranch}\`.`);

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
		const git = await resolveGitContext(pi, ctx);
		const slug = await chooseSlug(pi, ctx, git, args.slug);
		if (!slug) {
			return;
		}

		const show = await loadObjectiveShow(pi, ctx, git, slug);
		const freshness = await loadFreshnessAdvisories(pi, ctx, git, slug);
		const content = parseContent(show);
		const suggestedSlug = generateSuggestedSlug(slug, content);
		const collision = suggestedSlug ? await checkCollisions(pi, ctx, git, suggestedSlug) : undefined;
		const report = buildReport({
			slug,
			git,
			show,
			content,
			advisories: freshness.advisories,
			stale: freshness.stale,
			suggestedSlug,
			collision,
		});

		emitMessage(pi, report, {
			status: "ok",
			slug,
			suggestedSlug,
			branch: git.currentBranch,
			trunk: git.trunkBranch,
			collision,
		});
		if (ctx.hasUI) {
			ctx.ui.notify(`Objective next: ${slug}`, "info");
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
