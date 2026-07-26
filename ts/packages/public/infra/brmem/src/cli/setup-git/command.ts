import { defineCommand, failure, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

import type { BrmemCliContext } from "../../context.ts";
import {
	BRMEM_REFSPEC,
	buildGitSetupPlan,
	fetchConfigKey,
	pushConfigKey,
	type GitSetupAddition,
	type GitSetupAdditionReason,
	type GitSetupPlan,
} from "../../git-setup.ts";
import { gatewayFailure } from "../../entry-request.ts";

const DEFAULT_REMOTE = "origin";
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/u;

const gitSetupAdditionReasonSchema = z.enum([
	"preserve-default-push",
	"branch-memory-push",
	"branch-memory-fetch",
]);

const gitSetupAdditionSchema = z.object({
	key: z.string(),
	value: z.string(),
	reason: gitSetupAdditionReasonSchema,
});

export const setupGitRequestSchema = z.object({
	remote: z.string().default(DEFAULT_REMOTE).describe("Git remote to configure."),
	dryRun: z
		.boolean()
		.default(false)
		.describe("Show planned Git config changes without mutating local Git config."),
});

export const setupGitResultSchema = z.object({
	remote: z.string(),
	dryRun: z.boolean(),
	pushRefspec: z.string(),
	fetchRefspec: z.string(),
	existingPush: z.array(z.string()),
	existingFetch: z.array(z.string()),
	additions: z.array(gitSetupAdditionSchema),
});

export type SetupGitRequest = z.infer<typeof setupGitRequestSchema>;
export type SetupGitResult = z.infer<typeof setupGitResultSchema>;
export type { GitSetupAddition, GitSetupAdditionReason };

export async function runSetupGit(ctx: BrmemCliContext, request: SetupGitRequest) {
	const remote = normalizeRemoteName(request.remote);
	if (remote === undefined)
		return failure(
			"invalid-remote",
			"Git remote name must not be empty or contain control characters.",
		);

	const configOpt = await ctx.gateway.getRemoteConfig(remote);
	if (configOpt.type === "error") return gatewayFailure<SetupGitResult>(configOpt.error);
	if (configOpt.type === "missing")
		return failure("remote-not-found", `Git remote ${JSON.stringify(remote)} was not found.`);

	const pushValues = configOpt.value.push;
	const fetchValues = configOpt.value.fetch;

	const plan = buildGitSetupPlan({ remote, existing: { push: pushValues, fetch: fetchValues } });
	const result = setupGitResultFromPlan(plan, request.dryRun);
	if (request.dryRun) return ok(result);

	const pushAdditions = plan.additions
		.filter((a) => a.key === pushConfigKey(remote))
		.map((a) => a.value);
	const fetchAdditions = plan.additions
		.filter((a) => a.key === fetchConfigKey(remote))
		.map((a) => a.value);

	if (pushAdditions.length > 0 || fetchAdditions.length > 0) {
		const added = await ctx.gateway.addRemoteRefspecs(remote, pushAdditions, fetchAdditions);
		if (added.type === "error") return gatewayFailure<SetupGitResult>(added.error);
	}
	return ok(result);
}

export function renderSetupGit(result: SetupGitResult): string {
	if (result.additions.length === 0) {
		return `Git remote ${result.remote} is already configured for Branch Memory Snapshot Refs.`;
	}
	const lines = [
		result.dryRun
			? `Would configure Git remote ${result.remote} for Branch Memory Snapshot Refs.`
			: `Configured Git remote ${result.remote} for Branch Memory Snapshot Refs.`,
		result.dryRun ? "Would add:" : "Added:",
		...result.additions.map((addition) => `  ${addition.key} = ${addition.value}`),
	];
	if (!result.dryRun) {
		lines.push(
			"",
			`Future \`git push ${result.remote}\` will include refs/brmem/*.`,
			`Future \`git fetch ${result.remote}\` will fetch refs/brmem/* without force-updating local Branch Memory refs.`,
		);
	}
	return lines.join("\n");
}

export async function command() {
	return defineCommand({
		schema: setupGitRequestSchema,
		resultSchema: setupGitResultSchema,
		handler: runSetupGit,
		renderHuman: renderSetupGit,
	});
}

function normalizeRemoteName(remote: string): string | undefined {
	const normalized = remote.trim();
	if (normalized.length === 0) return undefined;
	if (CONTROL_CHARACTER_PATTERN.test(normalized)) return undefined;
	return normalized;
}

function setupGitResultFromPlan(plan: GitSetupPlan, dryRun: boolean): SetupGitResult {
	return {
		remote: plan.remote,
		dryRun: dryRun,
		pushRefspec: BRMEM_REFSPEC,
		fetchRefspec: BRMEM_REFSPEC,
		existingPush: [...plan.existingPush],
		existingFetch: [...plan.existingFetch],
		additions: [...plan.additions],
	};
}
