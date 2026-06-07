import type { CommandResult } from "asdl-dev/src/checkpoint-flow.ts";

import { MAX_BRANCH_SLUG_LENGTH, trimBranchSlugToLength } from "./branch-slug.ts";

const GIT_TIMEOUT_MS = 30_000;

export interface BranchNameAvailabilityInput {
	cwd: string;
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
}

export interface AvailableBranchName {
	name: string;
	usedSuffix: boolean;
}

export async function chooseAvailableBranchName(
	input: BranchNameAvailabilityInput,
	baseSlug: string,
): Promise<{ ok: true; name: string; usedSuffix: boolean } | { ok: false }> {
	for (let index = 0; index < 50; index += 1) {
		const suffix = index === 0 ? "" : `-${index + 1}`;
		const candidate = trimBranchSlugToLength(baseSlug, MAX_BRANCH_SLUG_LENGTH - suffix.length) + suffix;
		const valid = await input.exec("git", ["check-ref-format", "--branch", candidate], input.cwd, GIT_TIMEOUT_MS);
		if (valid.code !== 0) {
			continue;
		}
		const exists = await input.exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`], input.cwd, GIT_TIMEOUT_MS);
		if (exists.code !== 0) {
			return { ok: true, name: candidate, usedSuffix: index > 0 };
		}
	}
	return { ok: false };
}
