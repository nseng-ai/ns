import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";

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

type ParsedObjectiveList =
	| {
			kind: "repo";
			objectives: RepoObjective[];
	  }
	| {
			kind: "branch";
			branch: string;
			slugs: string[];
			entries: BranchEntry[];
	  }
	| {
			kind: "error";
			error: string;
			errorType?: string;
	  };

type ObjectiveListMessageDetails = {
	mode: "repo" | "branch";
	objectives: RepoObjective[];
	branchName?: string;
	slugs: string[];
	entries: BranchEntry[];
	fetchedAt: number;
	command: string;
	error?: string;
	errorType?: string;
};

type ObjectiveCommandCandidate = {
	command: string;
	prefixArgs: string[];
};

const STATUS_KEY = "objective-list";
const CUSTOM_TYPE = "objective-list";
const DEFAULT_TIMEOUT_MS = 15_000;
const SUPPORTED_FLAGS = ["--here", "--branch <name>", "--all", "--closed"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function messageFromUnknown(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

function normalizeState(state: string): string {
	return state.trim().toLowerCase();
}

function slugForKey(key: string): string {
	const slashIndex = key.lastIndexOf("/");
	return slashIndex === -1 ? key : key.slice(0, slashIndex);
}

function fileNameForKey(key: string, slug: string): string {
	const prefix = `${slug}/`;
	return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

function splitArgs(argsText: string): string[] {
	return argsText
		.trim()
		.split(/\s+/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

function hasFlag(args: string[], flag: string): boolean {
	return args.includes(flag) || args.some((arg) => arg.startsWith(`${flag}=`));
}

function sanitizeArgs(argsText: string): string[] {
	const rawArgs = splitArgs(argsText);
	const args = rawArgs[0] === "list" || rawArgs[0] === "ls" ? rawArgs.slice(1) : rawArgs;

	if (hasFlag(args, "--format")) {
		throw new Error("/objective-list always uses JSON internally. Omit --format.");
	}
	if (hasFlag(args, "--schema")) {
		throw new Error("/objective-list does not support --schema. Run `objective list --schema` in a shell instead.");
	}
	if (args.includes("-h") || args.includes("--help")) {
		throw new Error(`Supported flags: ${SUPPORTED_FLAGS.join(", ")}. Use \`objective list --help\` in a shell for full help.`);
	}

	return args;
}

function shellQuote(part: string): string {
	return /^[A-Za-z0-9_./:@%+=,-]+$/.test(part) ? part : JSON.stringify(part);
}

function formatCommand(parts: string[]): string {
	return parts.map(shellQuote).join(" ");
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
		add({
			command: join(venvRoot, ".venv", "bin", "objective"),
			prefixArgs: [],
		});
	}

	add({ command: "objective", prefixArgs: [] });

	const projectRoot = findAncestorContaining(cwd, "pyproject.toml");
	if (projectRoot) {
		add({
			command: "uv",
			prefixArgs: ["run", "--directory", projectRoot, "objective"],
		});
	}

	return candidates;
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

function parseObjectiveListEnvelope(stdout: string): ParsedObjectiveList {
	const trimmed = stdout.trim();
	if (trimmed.length === 0) {
		throw new Error("Command returned no JSON output.");
	}

	const payload = JSON.parse(trimmed) as unknown;
	if (!isRecord(payload) || typeof payload.exit_code !== "number") {
		throw new Error("Command did not return a clinkr JSON envelope.");
	}

	if (payload.exit_code !== 0) {
		return {
			kind: "error",
			error: typeof payload.message === "string" ? payload.message : `Command exited with code ${payload.exit_code}.`,
			errorType: typeof payload.error_type === "string" ? payload.error_type : undefined,
		};
	}

	const data = payload.data;
	if (isRepoListData(data)) {
		return { kind: "repo", objectives: data.objectives };
	}
	if (isBranchListData(data)) {
		return {
			kind: "branch",
			branch: data.branch,
			slugs: data.slugs,
			entries: data.entries,
		};
	}

	throw new Error("Command JSON did not match the current objective list schema.");
}

async function executeObjectiveList(pi: ExtensionAPI, cwd: string, forwardedArgs: string[]) {
	const candidates = resolveObjectiveCommandCandidates(cwd);
	let lastError = "Unable to run objective list.";

	for (const candidate of candidates) {
		const args = [...candidate.prefixArgs, "list", ...forwardedArgs, "--format", "json"];
		const commandText = formatCommand([candidate.command, ...args]);

		try {
			const result = await pi.exec(candidate.command, args, {
				timeout: DEFAULT_TIMEOUT_MS,
			});

			if (result.stdout.trim().length > 0) {
				try {
					return {
						commandText,
						parsed: parseObjectiveListEnvelope(result.stdout),
					};
				} catch (error) {
					lastError = `${commandText}: ${messageFromUnknown(error)}`;
					continue;
				}
			}

			lastError = result.stderr.trim() || `${commandText} exited with code ${result.code}.`;
		} catch (error) {
			lastError = `${commandText}: ${messageFromUnknown(error)}`;
		}
	}

	throw new Error(lastError);
}

function buildSummary(details: ObjectiveListMessageDetails): string {
	if (details.error) {
		return details.errorType
			? `Failed to load objectives (${details.errorType}): ${details.error}`
			: `Failed to load objectives: ${details.error}`;
	}
	if (details.mode === "branch") {
		return `Loaded ${pluralize(details.slugs.length, "objective slug")} from ${details.branchName}.`;
	}
	return `Loaded ${pluralize(details.objectives.length, "objective")}.`;
}

function renderStateBadge(state: string, theme: any): string {
	const normalized = normalizeState(state);
	if (normalized === "open") {
		return theme.fg("success", "● open");
	}
	if (normalized === "closed") {
		return theme.fg("muted", "○ closed");
	}
	return theme.fg("warning", `• ${normalized}`);
}

function renderCanonicalBadge(canonicalPresent: boolean, theme: any): string {
	return canonicalPresent ? theme.fg("success", "canonical") : theme.fg("warning", "snapshot-only");
}

function renderRepoObjective(objective: RepoObjective, expanded: boolean, theme: any): string {
	const liveBranches = objective.branches.filter((branch) => !branch.deleted).map((branch) => branch.branch);
	const deletedBranches = objective.branches.filter((branch) => branch.deleted).map((branch) => branch.branch);
	const branchSummary = theme.fg(
		"muted",
			`${pluralize(liveBranches.length, "live branch", "live branches")}${deletedBranches.length > 0 ? `, ${pluralize(deletedBranches.length, "deleted branch", "deleted branches")}` : ""}`,
	);

	let text = `${theme.fg("accent", objective.slug)} ${renderStateBadge(objective.state, theme)} ${renderCanonicalBadge(objective.canonical_present, theme)}`;
	text += `\n${theme.fg("muted", "files ")}${objective.files.join(", ") || "—"}`;
	text += `\n${theme.fg("muted", "snapshots ")}${branchSummary}`;

	if (expanded) {
		if (liveBranches.length > 0) {
			text += `\n${theme.fg("muted", "live: ")}${liveBranches.join(", ")}`;
		}
		if (deletedBranches.length > 0) {
			text += `\n${theme.fg("warning", "deleted: ")}${deletedBranches.join(", ")}`;
		}
	}

	return text;
}

function groupBranchEntries(entries: BranchEntry[]) {
	const grouped = new Map<string, { files: string[]; refNames: string[] }>();

	for (const entry of entries) {
		const slug = slugForKey(entry.key);
		const group = grouped.get(slug) ?? { files: [], refNames: [] };
		const fileName = fileNameForKey(entry.key, slug);
		if (!group.files.includes(fileName)) {
			group.files.push(fileName);
		}
		if (!group.refNames.includes(entry.ref_name)) {
			group.refNames.push(entry.ref_name);
		}
		grouped.set(slug, group);
	}

	return [...grouped.entries()]
		.map(([slug, data]) => ({
			slug,
			files: [...data.files].sort(),
			refNames: [...data.refNames].sort(),
		}))
		.sort((a, b) => a.slug.localeCompare(b.slug));
}

function renderBranchObjective(
	slug: string,
	files: string[],
	refNames: string[],
	branchName: string | undefined,
	expanded: boolean,
	theme: any,
): string {
	let text = `${theme.fg("accent", slug)} ${theme.fg("success", "branch snapshot")}`;
	text += `\n${theme.fg("muted", "files ")}${files.join(", ") || "—"}`;
	if (branchName) {
		text += `\n${theme.fg("muted", "branch ")}${branchName}`;
	}
	if (expanded && refNames.length > 0) {
		text += `\n${theme.fg("muted", "refs ")}${refNames.join(", ")}`;
	}
	return text;
}

export default function objectiveListExtension(pi: ExtensionAPI) {
	pi.registerMessageRenderer(CUSTOM_TYPE, (message, { expanded }, theme) => {
		const details = message.details as ObjectiveListMessageDetails | undefined;
		const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));

		if (!details) {
			box.addChild(new Text(message.content || "Objective list", 0, 0));
			return box;
		}

		const total = details.mode === "branch" ? details.slugs.length : details.objectives.length;
		const title = details.mode === "branch" ? `Objective list · ${details.branchName}` : "Objective list";
		let text = `${theme.fg("toolTitle", title)}${theme.fg("dim", ` · ${total} total`)}`;

		if (details.error) {
			text += `\n\n${theme.fg("error", details.error)}`;
			if (details.errorType) {
				text += `\n${theme.fg("dim", `error_type: ${details.errorType}`)}`;
			}
		} else if (details.mode === "repo") {
			if (details.objectives.length === 0) {
				text += `\n\n${theme.fg("muted", "No objectives found.")}`;
			} else {
				for (const objective of details.objectives) {
					text += `\n\n${renderRepoObjective(objective, expanded, theme)}`;
				}
			}
		} else {
			if (details.slugs.length === 0) {
				text += `\n\n${theme.fg("muted", "No objective snapshots found on this branch.")}`;
			} else {
				for (const group of groupBranchEntries(details.entries)) {
					text += `\n\n${renderBranchObjective(
						group.slug,
						group.files,
						group.refNames,
						details.branchName,
						expanded,
						theme,
					)}`;
				}
			}
		}

		text += `\n\n${theme.fg("dim", `Source: ${details.command}`)}`;
		if (expanded) {
			text += `\n${theme.fg("dim", `Fetched ${new Date(details.fetchedAt).toLocaleString()}`)}`;
		}

		box.addChild(new Text(text, 0, 0));
		return box;
	});

	pi.registerCommand("objective-list", {
		description: "Render `objective list` in the Pi TUI (flags: --here, --branch <name>, --all, --closed)",
		getArgumentCompletions: (prefix) => {
			const items = [
				{
					value: "--here",
					label: "--here · list objective snapshots on the current branch",
				},
				{
					value: "--branch ",
					label: "--branch <name> · list objective snapshots for a specific branch",
				},
				{
					value: "--all",
					label: "--all · include closed objectives in repo view",
				},
				{
					value: "--closed",
					label: "--closed · show only closed objectives in repo view",
				},
			];
			const filtered = items.filter((item) => item.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : prefix.length === 0 ? items : null;
		},
		handler: async (argsText, ctx) => {
			if (ctx.hasUI) {
				ctx.ui.setStatus(STATUS_KEY, "Loading objectives…");
			}

			try {
				const forwardedArgs = sanitizeArgs(argsText);
				const { commandText, parsed } = await executeObjectiveList(pi, ctx.cwd, forwardedArgs);
				const baseDetails: ObjectiveListMessageDetails = {
					mode: parsed.kind === "branch" ? "branch" : "repo",
					objectives: parsed.kind === "repo" ? parsed.objectives : [],
					branchName: parsed.kind === "branch" ? parsed.branch : undefined,
					slugs: parsed.kind === "branch" ? parsed.slugs : [],
					entries: parsed.kind === "branch" ? parsed.entries : [],
					fetchedAt: Date.now(),
					command: commandText,
				};

				const details: ObjectiveListMessageDetails =
					parsed.kind === "error"
						? {
							...baseDetails,
							error: parsed.error,
							errorType: parsed.errorType,
						}
						: baseDetails;

				pi.sendMessage({
					customType: CUSTOM_TYPE,
					content: buildSummary(details),
					display: true,
					details,
				});

				if (ctx.hasUI) {
					ctx.ui.notify(
						details.error ? `Failed to load objectives: ${details.error}` : buildSummary(details),
						details.error ? "error" : "info",
					);
				}
			} catch (error) {
				const message = messageFromUnknown(error);
				const details: ObjectiveListMessageDetails = {
					mode: "repo",
					objectives: [],
					slugs: [],
					entries: [],
					fetchedAt: Date.now(),
					command: "objective list --format json",
					error: message,
				};

				pi.sendMessage({
					customType: CUSTOM_TYPE,
					content: buildSummary(details),
					display: true,
					details,
				});

				if (ctx.hasUI) {
					ctx.ui.notify(`Failed to load objectives: ${message}`, "error");
				}
			} finally {
				if (ctx.hasUI) {
					ctx.ui.setStatus(STATUS_KEY, undefined);
				}
			}
		},
	});
}
