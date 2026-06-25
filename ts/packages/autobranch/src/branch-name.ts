import type { CommandResult } from "./shared.ts";
import { MAX_BRANCH_SLUG_LENGTH, trimBranchSlugToLength } from "@sdl/pi/branches/slug";

const GIT_TIMEOUT_MS = 30_000;

export interface BranchNameAvailabilityInput {
	cwd: string;
	exec: (command: string, args: string[], timeout: number) => Promise<CommandResult>;
}

export interface AvailableBranchName {
	name: string;
	hasSuffix: boolean;
}

export async function chooseAvailableBranchName(
	input: BranchNameAvailabilityInput,
	baseSlug: string,
): Promise<({ ok: true } & AvailableBranchName) | { ok: false }> {
	const candidates = branchNameCandidates(
		(_, suffix) =>
			trimBranchSlugToLength(baseSlug, MAX_BRANCH_SLUG_LENGTH - suffix.length) + suffix,
	);
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
		if (await isBranchNameAvailable(input, candidate.name)) {
			return { ok: true, name: candidate.name, hasSuffix: candidate.hasSuffix };
		}
	}
	return undefined;
}

async function isBranchNameAvailable(
	input: BranchNameAvailabilityInput,
	branchName: string,
): Promise<boolean> {
	const valid = await input.exec(
		"git",
		["check-ref-format", "--branch", branchName],
		GIT_TIMEOUT_MS,
	);
	if (valid.code !== 0) return false;

	const refsToCheck = [branchHeadRef(branchName), ...branchParentHeadRefs(branchName)];
	for (const ref of refsToCheck) {
		const exists = await input.exec(
			"git",
			["show-ref", "--verify", "--quiet", ref],
			GIT_TIMEOUT_MS,
		);
		if (exists.code !== 1) return false;
	}

	const childRefs = await input.exec(
		"git",
		["for-each-ref", "--format=%(refname)", `${branchHeadRef(branchName)}/`],
		GIT_TIMEOUT_MS,
	);
	return childRefs.code === 0 && childRefs.stdout.trim().length === 0;
}

function branchHeadRef(branchName: string): string {
	return `refs/heads/${branchName}`;
}

function branchParentHeadRefs(branchName: string): string[] {
	const segments = branchName.split("/");
	const refs: string[] = [];
	for (let index = 1; index < segments.length; index += 1) {
		refs.push(branchHeadRef(segments.slice(0, index).join("/")));
	}
	return refs;
}

export function* branchNameCandidates<TName extends string>(
	nameBuilder: (index: number, suffix: string) => TName,
): Iterable<{ name: TName; hasSuffix: boolean }> {
	for (let index = 0; index < 50; index += 1) {
		const suffix = index === 0 ? "" : `-${index + 1}`;
		yield { name: nameBuilder(index, suffix), hasSuffix: index > 0 };
	}
}
