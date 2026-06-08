import type { CommandResult } from "asdl-dev/src/checkpoint-flow.ts";

import { MAX_BRANCH_SLUG_LENGTH, trimBranchSlugToLength } from "./branch-slug.ts";

const GIT_TIMEOUT_MS = 30_000;

export interface BranchNameAvailabilityInput {
	cwd: string;
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
}

export interface AvailableBranchName {
	name: string;
	hasSuffix: boolean;
}

export async function chooseAvailableBranchName(
	input: BranchNameAvailabilityInput,
	baseSlug: string,
): Promise<({ ok: true } & AvailableBranchName) | { ok: false }> {
	const candidates = branchNameCandidates((_, suffix) => trimBranchSlugToLength(baseSlug, MAX_BRANCH_SLUG_LENGTH - suffix.length) + suffix);
	const available = await findAvailableBranchName(input, candidates);
	if (!available) {
		return { ok: false };
	}
	return available;
}

export async function findAvailableBranchName<TName extends string>(
	input: BranchNameAvailabilityInput,
	candidates: Iterable<{ name: TName; hasSuffix: boolean }>,
): Promise<({ ok: true } & AvailableBranchName & { name: TName }) | undefined> {
	for (const candidate of candidates) {
		const valid = await input.exec("git", ["check-ref-format", "--branch", candidate.name], input.cwd, GIT_TIMEOUT_MS);
		if (valid.code !== 0) {
			continue;
		}
		const exists = await input.exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${candidate.name}`], input.cwd, GIT_TIMEOUT_MS);
		if (exists.code !== 0) {
			return { ok: true, name: candidate.name, hasSuffix: candidate.hasSuffix };
		}
	}
	return undefined;
}

export function* branchNameCandidates<TName extends string>(nameBuilder: (index: number, suffix: string) => TName): Iterable<{ name: TName; hasSuffix: boolean }> {
	for (let index = 0; index < 50; index += 1) {
		const suffix = index === 0 ? "" : `-${index + 1}`;
		yield { name: nameBuilder(index, suffix), hasSuffix: index > 0 };
	}
}
