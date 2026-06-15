import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";
import { gatewayFailure } from "./shared.ts";

const DEFAULT_REMOTE = "origin";
const BRMEM_REFSPEC = "refs/brmem/*:refs/brmem/*";
const HEAD_PUSH_REFSPEC = "HEAD";
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/u;

const gitSetupAdditionReasonSchema = z.enum(["preserve-default-push", "branch-memory-push", "branch-memory-fetch"]);

const gitSetupAdditionSchema = z.object({
	key: z.string(),
	value: z.string(),
	reason: gitSetupAdditionReasonSchema,
});

export const setupGitRequestSchema = z.object({
	remote: z.string().default(DEFAULT_REMOTE).describe("Git remote to configure."),
	dry_run: z.boolean().default(false).describe("Show planned Git config changes without mutating local Git config."),
});

export const setupGitResultSchema = z.object({
	remote: z.string(),
	dry_run: z.boolean(),
	push_refspec: z.string(),
	fetch_refspec: z.string(),
	existing_push: z.array(z.string()),
	existing_fetch: z.array(z.string()),
	additions: z.array(gitSetupAdditionSchema),
});

export type SetupGitRequest = z.infer<typeof setupGitRequestSchema>;
export type SetupGitResult = z.infer<typeof setupGitResultSchema>;
export type GitSetupAddition = z.infer<typeof gitSetupAdditionSchema>;
export type GitSetupAdditionReason = z.infer<typeof gitSetupAdditionReasonSchema>;

export interface ExistingGitSetupConfig {
	push: readonly string[];
	fetch: readonly string[];
}

export interface GitSetupPlan {
	remote: string;
	existingPush: readonly string[];
	existingFetch: readonly string[];
	additions: readonly GitSetupAddition[];
}

export async function runSetupGit(ctx: BrmemCliContext, request: SetupGitRequest) {
	const remote = normalizeRemoteName(request.remote);
	if (remote === undefined) return failure("invalid_remote", "Git remote name must not be empty or contain control characters.");

	const configOpt = await ctx.gateway.getRemoteConfig(remote);
	if (configOpt.type === "error") return gatewayFailure<SetupGitResult>(configOpt.error);
	if (configOpt.type === "missing") return failure("remote_not_found", `Git remote ${JSON.stringify(remote)} was not found.`);

	const pushValues = configOpt.value.push;
	const fetchValues = configOpt.value.fetch;

	const plan = buildGitSetupPlan({ remote, existing: { push: pushValues, fetch: fetchValues } });
	const result = setupGitResultFromPlan(plan, request.dry_run);
	if (request.dry_run) return ok(result);

	const pushAdditions = plan.additions.filter((a) => a.key === pushConfigKey(remote)).map((a) => a.value);
	const fetchAdditions = plan.additions.filter((a) => a.key === fetchConfigKey(remote)).map((a) => a.value);

	if (pushAdditions.length > 0 || fetchAdditions.length > 0) {
		const added = await ctx.gateway.addRemoteRefspecs(remote, pushAdditions, fetchAdditions);
		if (added.type === "error") return gatewayFailure<SetupGitResult>(added.error);
	}
	return ok(result);
}

export function buildGitSetupPlan(options: { remote: string; existing: ExistingGitSetupConfig }): GitSetupPlan {
	const pushKey = pushConfigKey(options.remote);
	const fetchKey = fetchConfigKey(options.remote);
	const additions: GitSetupAddition[] = [];
	if (options.existing.push.length === 0) {
		additions.push({ key: pushKey, value: HEAD_PUSH_REFSPEC, reason: "preserve-default-push" });
	}
	const plannedPushValues = additions.filter((addition) => addition.key === pushKey).map((addition) => addition.value);
	if (!options.existing.push.includes(BRMEM_REFSPEC) && !plannedPushValues.includes(BRMEM_REFSPEC)) {
		additions.push({ key: pushKey, value: BRMEM_REFSPEC, reason: "branch-memory-push" });
	}
	if (!options.existing.fetch.includes(BRMEM_REFSPEC)) {
		additions.push({ key: fetchKey, value: BRMEM_REFSPEC, reason: "branch-memory-fetch" });
	}
	return {
		remote: options.remote,
		existingPush: [...options.existing.push],
		existingFetch: [...options.existing.fetch],
		additions,
	};
}

export function renderSetupGit(result: SetupGitResult): string {
	if (result.additions.length === 0) {
		return `Git remote ${result.remote} is already configured for Branch Memory Snapshot Refs.`;
	}
	const lines = [
		result.dry_run
			? `Would configure Git remote ${result.remote} for Branch Memory Snapshot Refs.`
			: `Configured Git remote ${result.remote} for Branch Memory Snapshot Refs.`,
		result.dry_run ? "Would add:" : "Added:",
		...result.additions.map((addition) => `  ${addition.key} = ${addition.value}`),
	];
	if (!result.dry_run) {
		lines.push(
			"",
			`Future \`git push ${result.remote}\` will include refs/brmem/*.`,
			`Future \`git fetch ${result.remote}\` will fetch refs/brmem/* without force-updating local Branch Memory refs.`,
		);
	}
	return lines.join("\n");
}

function normalizeRemoteName(remote: string): string | undefined {
	const normalized = remote.trim();
	if (normalized.length === 0) return undefined;
	if (CONTROL_CHARACTER_PATTERN.test(normalized)) return undefined;
	return normalized;
}

function pushConfigKey(remote: string): string {
	return `remote.${remote}.push`;
}

function fetchConfigKey(remote: string): string {
	return `remote.${remote}.fetch`;
}

function setupGitResultFromPlan(plan: GitSetupPlan, dryRun: boolean): SetupGitResult {
	return {
		remote: plan.remote,
		dry_run: dryRun,
		push_refspec: BRMEM_REFSPEC,
		fetch_refspec: BRMEM_REFSPEC,
		existing_push: [...plan.existingPush],
		existing_fetch: [...plan.existingFetch],
		additions: [...plan.additions],
	};
}
