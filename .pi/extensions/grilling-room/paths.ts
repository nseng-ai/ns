import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const GIT_TIMEOUT_MS = 5_000;
const RUN_ID_SLUG_MAX = 48;

export const AGENT_DIR = path.join(homedir(), ".pi", "agent");
export const GRILLING_ROOT = path.join(AGENT_DIR, "subharnesses", "grilling");

export interface CommandResult {
	code: number;
	stdout: string;
	stderr: string;
	killed?: boolean;
}

export type CommandRunner = (
	command: string,
	args: string[],
	options?: { cwd?: string; timeout?: number },
) => Promise<CommandResult>;

export interface GrillingRunScope {
	repoRoot: string;
	repoHash: string;
	branch: string;
	branchSegment: string;
	runsRoot: string;
}

export interface RecentRunDirectory {
	runDir: string;
	runId: string;
	reportPath: string;
	modifiedMs: number;
}

export async function getGitRoot(run: CommandRunner, cwd: string): Promise<string> {
	const result = await run("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: GIT_TIMEOUT_MS });
	const root = result.stdout.trim();
	return result.code === 0 && root.length > 0 ? root : cwd;
}

export async function getCurrentBranch(run: CommandRunner, cwd: string): Promise<string> {
	const result = await run("git", ["branch", "--show-current"], { cwd, timeout: GIT_TIMEOUT_MS });
	const branch = result.stdout.trim();
	return result.code === 0 && branch.length > 0 ? branch : "no-branch";
}

export function hashRepoRoot(root: string): string {
	return createHash("sha256").update(root).digest("hex").slice(0, 12);
}

export function sanitizePathSegment(value: string, fallback = "untitled"): string {
	const sanitized = value
		.trim()
		.replace(/[/:\s]+/g, "-")
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[-.]+|[-.]+$/g, "");
	return sanitized.length > 0 ? sanitized : fallback;
}

export function createRunId(focus: string, now = new Date()): string {
	const timestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
	const slug = sanitizePathSegment(focus.toLowerCase(), "grilling-room").slice(0, RUN_ID_SLUG_MAX);
	return `${timestamp}-${slug}`;
}

export async function resolveRunScope(run: CommandRunner, cwd: string): Promise<GrillingRunScope> {
	const repoRoot = await getGitRoot(run, cwd);
	const branch = await getCurrentBranch(run, cwd);
	const repoHash = hashRepoRoot(repoRoot);
	const branchSegment = sanitizePathSegment(branch, "no-branch");
	const runsRoot = path.join(GRILLING_ROOT, repoHash, branchSegment);
	return { repoRoot, repoHash, branch, branchSegment, runsRoot };
}

export function createRunDirectoryPath(scope: GrillingRunScope, focus: string): string {
	return path.join(scope.runsRoot, createRunId(focus));
}

export function shortenHome(value: string): string {
	const home = homedir();
	return value.startsWith(home) ? `~${value.slice(home.length)}` : value;
}

export async function listRecentRunDirectories(scope: GrillingRunScope): Promise<RecentRunDirectory[]> {
	let entries;
	try {
		entries = await readdir(scope.runsRoot, { withFileTypes: true });
	} catch {
		return [];
	}

	const runs: RecentRunDirectory[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
		const runDir = path.join(scope.runsRoot, entry.name);
		const reportPath = path.join(runDir, "report.md");
		try {
			const reportStat = await stat(reportPath);
			runs.push({ runDir, runId: entry.name, reportPath, modifiedMs: reportStat.mtimeMs });
		} catch {
			// Not a recoverable Grilling Room run without report.md.
		}
	}

	return runs.sort((left, right) => right.modifiedMs - left.modifiedMs);
}
