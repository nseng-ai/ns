import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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

export default function slotCoExtension(pi: ExtensionAPI) {
	pi.registerCommand(COMMAND_NAME, {
		description: "Check out a branch into a slot worktree and switch Pi to a fresh session there",
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
