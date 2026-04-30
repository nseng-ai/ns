import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type SlotListRow = {
	slot_name: string;
	branch: string | null;
	worktree_path: string | null;
	status: string;
};

type SlotListEnvelope =
	| {
			exit_code: 0;
			data: {
				rows: SlotListRow[];
			};
	  }
	| {
			exit_code: number;
			error_type?: string;
			message?: string;
	  };

type CurrentSlotMetadata = {
	branchName: string;
	slotName: string;
	worktreePath: string;
};

const COMMAND_NAME = "cmux-refresh-meta";
const SLOT_NAME_PATTERN = /^slot-\d+$/;

export default function cmuxRefreshMetaExtension(pi: ExtensionAPI) {
	pi.registerCommand(COMMAND_NAME, {
		description: "Refresh the current cmux workspace name and description from the current slot worktree",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			const metadata = await getCurrentSlotMetadata(pi, ctx.cwd);
			if ("error" in metadata) {
				ctx.ui.notify(metadata.error, "error");
				return;
			}

			const refreshed = await refreshCmuxMetadata(pi, metadata);
			if ("error" in refreshed) {
				ctx.ui.notify(refreshed.error, "error");
				return;
			}

			ctx.ui.notify(
				`Refreshed cmux workspace metadata: ${metadata.branchName} (${metadata.slotName})`,
				"success",
			);
		},
	});
}

async function getCurrentSlotMetadata(
	pi: ExtensionAPI,
	cwd: string,
): Promise<CurrentSlotMetadata | { error: string }> {
	const worktreePath = await getGitWorktreePath(pi, cwd);
	if ("error" in worktreePath) {
		return worktreePath;
	}

	const branchName = await getCurrentBranchName(pi, worktreePath.value);
	if ("error" in branchName) {
		return branchName;
	}

	const slotName = await getSlotNameForWorktree(pi, worktreePath.value);
	if ("error" in slotName) {
		return slotName;
	}

	return {
		branchName: branchName.value,
		slotName: slotName.value,
		worktreePath: worktreePath.value,
	};
}

async function getGitWorktreePath(
	pi: ExtensionAPI,
	cwd: string,
): Promise<{ value: string } | { error: string }> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 5_000 });
	if (result.code !== 0) {
		const details = result.stderr.trim() || result.stdout.trim();
		return {
			error: ["Could not determine current git worktree path.", details].filter(Boolean).join("\n"),
		};
	}

	const value = result.stdout.trim();
	if (value.length === 0) {
		return { error: "Could not determine current git worktree path." };
	}
	return { value };
}

async function getCurrentBranchName(
	pi: ExtensionAPI,
	cwd: string,
): Promise<{ value: string } | { error: string }> {
	const result = await pi.exec("git", ["branch", "--show-current"], { cwd, timeout: 5_000 });
	if (result.code !== 0) {
		const details = result.stderr.trim() || result.stdout.trim();
		return {
			error: ["Could not determine current branch name.", details].filter(Boolean).join("\n"),
		};
	}

	const value = result.stdout.trim();
	if (value.length === 0) {
		return { error: "Current worktree is detached; cmux metadata needs a branch name." };
	}
	return { value };
}

async function getSlotNameForWorktree(
	pi: ExtensionAPI,
	worktreePath: string,
): Promise<{ value: string } | { error: string }> {
	const result = await pi.exec("slot", ["list", "--format", "json"], { cwd: worktreePath, timeout: 10_000 });
	const parsed = parseSlotListEnvelope(result.stdout);
	if (!parsed) {
		const fallback = basename(worktreePath);
		if (SLOT_NAME_PATTERN.test(fallback)) {
			return { value: fallback };
		}

		const details = result.stderr.trim() || result.stdout.trim();
		return {
			error: ["Could not determine current slot name from `slot list --format json`.", details]
				.filter(Boolean)
				.join("\n"),
		};
	}

	if (parsed.exit_code !== 0) {
		return {
			error: parsed.message ?? `slot list failed${parsed.error_type ? ` (${parsed.error_type})` : ""}.`,
		};
	}

	const matchingRow = parsed.data.rows.find((row) => row.worktree_path === worktreePath);
	if (matchingRow?.slot_name) {
		return { value: matchingRow.slot_name };
	}

	const fallback = basename(worktreePath);
	if (SLOT_NAME_PATTERN.test(fallback)) {
		return { value: fallback };
	}

	return { error: `Current worktree is not an assigned slot worktree: ${worktreePath}` };
}

async function refreshCmuxMetadata(
	pi: ExtensionAPI,
	metadata: CurrentSlotMetadata,
): Promise<{ ok: true } | { error: string }> {
	const rename = await pi.exec(
		"cmux",
		["workspace-action", "--action", "rename", "--title", metadata.branchName],
		{ cwd: metadata.worktreePath, timeout: 10_000 },
	);
	if (rename.code !== 0) {
		return { error: formatCmuxError("rename", rename.stdout, rename.stderr) };
	}

	const setDescription = await pi.exec(
		"cmux",
		["workspace-action", "--action", "set-description", "--description", metadata.slotName],
		{ cwd: metadata.worktreePath, timeout: 10_000 },
	);
	if (setDescription.code !== 0) {
		return { error: formatCmuxError("set description", setDescription.stdout, setDescription.stderr) };
	}

	return { ok: true };
}

function parseSlotListEnvelope(stdout: string): SlotListEnvelope | undefined {
	try {
		const parsed = JSON.parse(stdout) as Partial<SlotListEnvelope>;
		if (!parsed || typeof parsed !== "object" || typeof parsed.exit_code !== "number") {
			return undefined;
		}

		if (parsed.exit_code === 0) {
			const data = (parsed as { data?: { rows?: unknown } }).data;
			if (!data || !Array.isArray(data.rows)) {
				return undefined;
			}

			const rows: SlotListRow[] = [];
			for (const row of data.rows) {
				if (!row || typeof row !== "object") {
					return undefined;
				}
				const partial = row as Partial<SlotListRow>;
				if (
					typeof partial.slot_name !== "string" ||
					!(typeof partial.branch === "string" || partial.branch === null) ||
					!(typeof partial.worktree_path === "string" || partial.worktree_path === null) ||
					typeof partial.status !== "string"
				) {
					return undefined;
				}
				rows.push({
					slot_name: partial.slot_name,
					branch: partial.branch,
					worktree_path: partial.worktree_path,
					status: partial.status,
				});
			}

			return { exit_code: 0, data: { rows } };
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

function basename(path: string): string {
	const normalized = path.replace(/[\\/]+$/, "");
	const parts = normalized.split(/[\\/]/);
	return parts[parts.length - 1] ?? "";
}

function formatCmuxError(action: string, stdout: string, stderr: string): string {
	const details = stderr.trim() || stdout.trim();
	return [`Failed to ${action} current cmux workspace.`, details].filter(Boolean).join("\n");
}
