import type { ClinkrExit } from "@nseng-ai/clinkr";
import { failure, ok, usageError } from "@nseng-ai/clinkr";
import { z } from "zod";

import { activateObjectives } from "./activate-objectives.ts";
import type { ObjectiveActivationContext } from "./activation-context.ts";
import {
	normalizeHarnessSelection,
	parseNsTomlHarnesses,
	planNsTomlHarnessesWrite,
	type NsTomlChange,
} from "./ns-toml.ts";
import {
	ALL_HARNESS_IDS,
	type HarnessId,
	type SkillMaterializeResult,
} from "./skill-materializer.ts";

export const initObjectivesRequestSchema = z.object({
	harness: z
		.array(z.string())
		.default([])
		.describe("Harness to activate; repeatable. One of claude-code, codex, pi."),
});

const skillMaterializeResultSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("materialized"), installedSkillPaths: z.array(z.string()) }),
	z.object({ type: z.literal("unavailable"), reason: z.string() }),
	z.object({
		type: z.literal("error"),
		error: z.object({ code: z.string(), message: z.string() }),
	}),
]);

const fileChangeStatusSchema = z.enum(["created", "appended", "replaced", "unchanged"]);

const fileChangeSchema = z.object({
	change: fileChangeStatusSchema,
});

export const initObjectivesResultSchema = z.object({
	repoRoot: z.string(),
	trunkBranch: z.string(),
	harnesses: z.array(z.enum(ALL_HARNESS_IDS)),
	harnessSource: z.enum(["explicit", "ns-toml"]),
	nsToml: fileChangeSchema,
	agentsInstructionFile: fileChangeSchema,
	claudeInstructionFile: z.object({ change: fileChangeStatusSchema.exclude(["replaced"]) }),
	objectivesDirectory: z.object({ created: z.boolean() }),
	skills: skillMaterializeResultSchema,
});

export type InitObjectivesRequest = z.infer<typeof initObjectivesRequestSchema>;
export type InitObjectivesResult = z.infer<typeof initObjectivesResultSchema>;

export async function initObjectives(
	context: ObjectiveActivationContext,
	request: InitObjectivesRequest & { cwd: string },
): Promise<ClinkrExit<InitObjectivesResult>> {
	const repoRootResult = await context.git.optionalRepoRoot({ cwd: request.cwd });
	if (repoRootResult.type === "error") {
		return failure("ns-init-git-error", repoRootResult.error.message, repoRootResult.error);
	}
	if (repoRootResult.type === "missing") {
		return failure(
			"ns-init-not-a-git-repo",
			`No git repository found at ${request.cwd}; run \`git init\` first.`,
			{
				cwd: request.cwd,
			},
		);
	}
	const repoRoot = repoRootResult.value;

	const trunkResult = await context.git.trunkBranch({ cwd: repoRoot });
	if (trunkResult.type === "error") {
		return failure("ns-init-git-error", trunkResult.error.message, trunkResult.error);
	}
	if (trunkResult.type === "missing") {
		return failure(
			"ns-init-trunk-undetectable",
			"Could not detect a trunk branch for this repository; objectives need one to anchor durable records.",
			{ repoRoot },
		);
	}

	const harnessResolution = await resolveHarnesses(context, {
		repoRoot,
		explicitHarnesses: request.harness,
	});
	if (harnessResolution.type === "usage-error")
		return usageError(harnessResolution.message, harnessResolution.data);
	if (harnessResolution.type === "failure") {
		return failure(harnessResolution.errorType, harnessResolution.message, harnessResolution.data);
	}

	const activation = await activateObjectives(context, {
		cwd: request.cwd,
		harnesses: harnessResolution.harnesses,
	});
	if (activation.type !== "activated") return activationFailure(activation);

	return ok({
		...activation.report,
		skills: skillMaterializeResultData(activation.report.skills),
		harnesses: [...harnessResolution.harnesses],
		harnessSource: harnessResolution.harnessSource,
		nsToml: { change: harnessResolution.nsTomlChange },
	});
}

type HarnessResolution =
	| {
			type: "ok";
			harnesses: readonly HarnessId[];
			harnessSource: "explicit" | "ns-toml";
			nsTomlChange: NsTomlChange;
	  }
	| { type: "usage-error"; message: string; data: unknown }
	| { type: "failure"; errorType: string; message: string; data: unknown };

async function resolveHarnesses(
	context: ObjectiveActivationContext,
	options: { repoRoot: string; explicitHarnesses: readonly string[] },
): Promise<HarnessResolution> {
	const explicit =
		options.explicitHarnesses.length > 0
			? normalizeHarnessSelection(options.explicitHarnesses)
			: undefined;
	if (explicit?.type === "error") {
		return {
			type: "usage-error",
			message: explicit.error.message,
			data: { argument: "harness", code: explicit.error.code },
		};
	}

	const read = await context.files.readProjectConfigFile({ repoRoot: options.repoRoot });
	if (read.type === "error") {
		return configFailure("ns-init-config-read-failed", read.error);
	}

	if (explicit !== undefined) {
		const plan = planNsTomlHarnessesWrite({
			content: read.type === "found" ? read.content : undefined,
			harnesses: explicit.harnesses,
		});
		if (plan.type === "error") {
			return configFailure("ns-init-config-invalid", plan.error);
		}
		if (plan.change !== "unchanged") {
			const write = await context.files.writeProjectConfigFile({
				repoRoot: options.repoRoot,
				content: plan.content,
			});
			if (!write.ok) {
				return configFailure("ns-init-config-write-failed", write.error);
			}
		}
		return {
			type: "ok",
			harnesses: explicit.harnesses,
			harnessSource: "explicit",
			nsTomlChange: plan.change,
		};
	}

	if (read.type === "missing") {
		return harnessUsageError();
	}

	const parsed = parseNsTomlHarnesses(read.content);
	if (parsed.type === "missing") {
		return harnessUsageError();
	}
	if (parsed.type === "error") {
		return configFailure("ns-init-config-invalid", parsed.error);
	}
	return {
		type: "ok",
		harnesses: parsed.harnesses,
		harnessSource: "ns-toml",
		nsTomlChange: "unchanged",
	};
}

type ActivationFailure = Exclude<
	Awaited<ReturnType<typeof activateObjectives>>,
	{ type: "activated" }
>;

function harnessUsageError(): HarnessResolution {
	return {
		type: "usage-error",
		message:
			"Pass at least one --harness on first ns init run, or add top-level harnesses to ns.toml.",
		data: { argument: "harness", configFile: "ns.toml" },
	};
}

function configFailure(errorType: string, error: { message: string }): HarnessResolution {
	return {
		type: "failure",
		errorType,
		message: error.message,
		data: error,
	};
}

function activationFailure(result: ActivationFailure): ClinkrExit<InitObjectivesResult> {
	switch (result.type) {
		case "not-a-git-repo":
			return failure("ns-init-not-a-git-repo", result.message, {});
		case "trunk-undetectable":
			return failure("ns-init-trunk-undetectable", result.message, {});
		case "agents-block-malformed":
			return failure("ns-init-agents-block-malformed", result.reason, { reason: result.reason });
		case "error":
			return failure("ns-init-activation-failed", result.error.message, result.error);
	}
}

function skillMaterializeResultData(
	result: SkillMaterializeResult,
): InitObjectivesResult["skills"] {
	switch (result.type) {
		case "materialized":
			return { type: "materialized", installedSkillPaths: [...result.installedSkillPaths] };
		case "unavailable":
			return { type: "unavailable", reason: result.reason };
		case "error":
			return { type: "error", error: { ...result.error } };
	}
}

export function renderInitObjectivesHuman(data: InitObjectivesResult): string {
	return [
		`Activated ns Objectives in ${data.repoRoot}.`,
		`Harnesses (${data.harnessSource}): ${data.harnesses.join(", ")}.`,
		`ns.toml: ${data.nsToml.change}.`,
	].join("\n");
}
