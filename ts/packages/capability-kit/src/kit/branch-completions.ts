import { commandSucceeded, type CommandExecApi } from "@nseng-ai/foundation/command";

import type { AutocompleteItem } from "./pi-types.ts";

const MAX_COMPLETIONS = 30;
const BRANCH_FORMAT = "%(refname:short)\t%(refname)";
const GIT_TIMEOUT_MS = 5_000;

export interface BranchCandidate {
	name: string;
	scope: "local" | "remote";
}

/**
 * Extract the in-progress argument prefix from `/${commandName} <prefix>` text
 * before the cursor. Returns undefined when the text is not that command or
 * already has a completed argument.
 */
export function extractSlashCommandArgumentPrefix(
	commandName: string,
	textBeforeCursor: string,
): string | undefined {
	const commandPrefix = `/${commandName}`;
	if (!textBeforeCursor.startsWith(commandPrefix)) {
		return undefined;
	}

	const rest = textBeforeCursor.slice(commandPrefix.length);
	if (!rest.startsWith(" ")) {
		return undefined;
	}

	const argumentPrefix = rest.slice(1);
	return /\s/.test(argumentPrefix.trim()) ? undefined : argumentPrefix;
}

/**
 * List local and remote branch completions matching the argument prefix,
 * preferring exact matches, then prefix matches, then substring matches, with
 * local branches sorted ahead of remote ones.
 */
export async function getBranchCompletions(
	pi: CommandExecApi,
	cwd: string,
	argumentPrefix: string,
): Promise<AutocompleteItem[]> {
	const trimmedPrefix = argumentPrefix.trim();
	if (/\s/.test(trimmedPrefix)) {
		return [];
	}

	const candidates = await listBranchCandidates(pi, cwd);
	if (!candidates) {
		return [];
	}

	return filterBranchCandidates(candidates, trimmedPrefix)
		.slice(0, MAX_COMPLETIONS)
		.map((candidate) => ({
			value: candidate.name,
			label: candidate.name,
			description: candidate.scope,
		}));
}

export async function listBranchCandidates(
	pi: CommandExecApi,
	cwd: string,
): Promise<BranchCandidate[] | undefined> {
	const result = await pi.exec(
		"git",
		["for-each-ref", `--format=${BRANCH_FORMAT}`, "refs/heads", "refs/remotes"],
		{ cwd, timeout: GIT_TIMEOUT_MS },
	);
	if (!commandSucceeded(result)) {
		return undefined;
	}

	const seen = new Set<string>();
	const candidates: BranchCandidate[] = [];
	for (const line of result.stdout.split("\n")) {
		const trimmedLine = line.trim();
		if (trimmedLine.length === 0) {
			continue;
		}

		const [name, ref] = trimmedLine.split("\t");
		if (!name || !ref || name.endsWith("/HEAD")) {
			continue;
		}
		if (seen.has(name)) {
			continue;
		}

		seen.add(name);
		candidates.push({
			name,
			scope: ref.startsWith("refs/heads/") ? "local" : "remote",
		});
	}

	return candidates;
}

function filterBranchCandidates(candidates: BranchCandidate[], prefix: string): BranchCandidate[] {
	if (prefix.length === 0) {
		return sortBranchCandidates(candidates);
	}

	const exactMatches = candidates.filter((candidate) => candidate.name === prefix);
	if (exactMatches.length > 0) {
		return sortBranchCandidates(exactMatches);
	}

	const prefixMatches = candidates.filter((candidate) => candidate.name.startsWith(prefix));
	if (prefixMatches.length > 0) {
		return sortBranchCandidates(prefixMatches);
	}

	return sortBranchCandidates(candidates.filter((candidate) => candidate.name.includes(prefix)));
}

function sortBranchCandidates(candidates: BranchCandidate[]): BranchCandidate[] {
	return [...candidates].sort((left, right) => {
		if (left.scope !== right.scope) {
			return left.scope === "local" ? -1 : 1;
		}
		return left.name.localeCompare(right.name);
	});
}
