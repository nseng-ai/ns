import { basename, dirname, resolve } from "node:path";

export function compactSlotSlug(slotSlug: string): string {
	const match = /^slot-(\d+)$/.exec(slotSlug);
	if (match === null) return slotSlug;
	return `s${Number(match[1])}`;
}

export function slotLabelInput(cwd: string): { slotSlug: string } | Record<string, never> {
	const normalizedCwd = resolve(cwd);
	const worktreesDir = dirname(normalizedCwd);
	const repoDir = dirname(worktreesDir);
	const reposDir = dirname(repoDir);
	const slotsDir = dirname(reposDir);
	if (basename(worktreesDir) !== "worktrees") return {};
	if (basename(reposDir) !== "repos" || basename(slotsDir) !== "slots") return {};
	const slotSlug = basename(normalizedCwd);
	if (!/^slot-\d+$/.test(slotSlug)) return {};
	return { slotSlug };
}
