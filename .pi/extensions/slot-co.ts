import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AutocompleteItem } from "@mariozechner/pi-tui";

type SlotCheckoutData = {
	slot_name: string;
	branch_name: string;
	worktree_path: string;
	already_assigned: boolean;
};

type SlotCheckoutEnvelope =
	| {
			exit_code: 0;
			data: SlotCheckoutData;
	  }
	| {
			exit_code: number;
			error_type?: string;
			message?: string;
	  };

const COMMAND_NAME = "slot-co";
const MAX_COMPLETIONS = 30;
const BRANCH_FORMAT = "%(refname:short)\t%(refname)";

type BranchCandidate = {
	name: string;
	scope: "local" | "remote";
};

export default function slotCoExtension(pi: ExtensionAPI) {
	let currentCwd = process.cwd();

	pi.on("session_start", async (_event, ctx) => {
		currentCwd = ctx.cwd;
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Check out a branch into a slot worktree and switch Pi to a fresh session there",
		getArgumentCompletions: async (argumentPrefix) => {
			const completions = await getBranchCompletions(pi, currentCwd, argumentPrefix);
			return completions.length > 0 ? completions : null;
		},
		handler: async (args, ctx) => {
			const branch = args.trim();
			if (branch.length === 0) {
				ctx.ui.notify(`Usage: /${COMMAND_NAME} <branch>`, "error");
				return;
			}

			await ctx.waitForIdle();
			ctx.ui.notify(`Checking out ${branch} into a slot…`, "info");

			const target = await checkoutSlot(pi, ctx.cwd, branch);
			if ("error" in target) {
				ctx.ui.notify(target.error, "error");
				return;
			}

			const sessionPath = await createFreshSessionFile(target.worktreePath);
			await ctx.switchSession(sessionPath, {
				withSession: async (nextCtx) => {
					nextCtx.ui.notify(`Switched to ${target.branchName} in ${target.slotName}`, "success");
				},
			});
		},
	});
}

async function checkoutSlot(
	pi: ExtensionAPI,
	cwd: string,
	branch: string,
): Promise<
	| {
			slotName: string;
			branchName: string;
			worktreePath: string;
			alreadyAssigned: boolean;
	  }
	| { error: string }
> {
	const result = await pi.exec(
		"slot",
		["checkout", branch, "--format", "json", "--no-clipboard"],
		{ cwd, timeout: 30_000 },
	);

	const parsed = parseSlotCheckoutEnvelope(result.stdout);
	if (!parsed) {
		const stderr = result.stderr.trim();
		return {
			error:
				stderr.length > 0
					? `slot checkout failed: ${stderr}`
					: "slot checkout failed with unreadable JSON output.",
		};
	}

	if (parsed.exit_code !== 0) {
		return {
			error: parsed.message ?? `slot checkout failed${parsed.error_type ? ` (${parsed.error_type})` : ""}.`,
		};
	}

	return {
		slotName: parsed.data.slot_name,
		branchName: parsed.data.branch_name,
		worktreePath: parsed.data.worktree_path,
		alreadyAssigned: parsed.data.already_assigned,
	};
}

async function getBranchCompletions(
	pi: ExtensionAPI,
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

async function listBranchCandidates(pi: ExtensionAPI, cwd: string): Promise<BranchCandidate[] | undefined> {
	const result = await pi.exec(
		"git",
		["for-each-ref", `--format=${BRANCH_FORMAT}`, "refs/heads", "refs/remotes"],
		{ cwd, timeout: 5_000 },
	);
	if (result.code !== 0) {
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

function parseSlotCheckoutEnvelope(stdout: string): SlotCheckoutEnvelope | undefined {
	try {
		const parsed = JSON.parse(stdout) as Partial<SlotCheckoutEnvelope>;
		if (!parsed || typeof parsed !== "object" || typeof parsed.exit_code !== "number") {
			return undefined;
		}
		if (parsed.exit_code === 0) {
			const data = (parsed as { data?: Partial<SlotCheckoutData> }).data;
			if (
				!data ||
				typeof data.slot_name !== "string" ||
				typeof data.branch_name !== "string" ||
				typeof data.worktree_path !== "string" ||
				typeof data.already_assigned !== "boolean"
			) {
				return undefined;
			}
			return {
				exit_code: 0,
				data: {
					slot_name: data.slot_name,
					branch_name: data.branch_name,
					worktree_path: data.worktree_path,
					already_assigned: data.already_assigned,
				},
			};
		}
		return {
			exit_code: parsed.exit_code,
			error_type: typeof parsed.error_type === "string" ? parsed.error_type : undefined,
			message: typeof parsed.message === "string" ? parsed.message : undefined,
		};
	} catch {
		return undefined;
	}
}

async function createFreshSessionFile(targetCwd: string): Promise<string> {
	const sessionId = randomUUID();
	const timestamp = new Date().toISOString();
	const sessionDir = getDefaultSessionDir(targetCwd);
	const fileTimestamp = timestamp.replace(/[:.]/g, "-");
	const sessionPath = join(sessionDir, `${fileTimestamp}_${sessionId}.jsonl`);
	const header = {
		type: "session",
		version: 3,
		id: sessionId,
		timestamp,
		cwd: targetCwd,
	};

	await mkdir(sessionDir, { recursive: true });
	await writeFile(sessionPath, `${JSON.stringify(header)}\n`, "utf8");
	return sessionPath;
}

function getDefaultSessionDir(cwd: string): string {
	const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	const safePath = `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
	return join(agentDir, "sessions", safePath);
}
