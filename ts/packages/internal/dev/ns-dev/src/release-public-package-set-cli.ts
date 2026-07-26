import { resolve } from "node:path";

import { failure, ok, usageError, type ClinkrExit } from "@nseng-ai/clinkr";
import type { CommandRunner } from "@nseng-ai/foundation/exec";
import { z } from "zod";

import type { NsDevCliContext } from "./context.ts";
import { repoRoot, workspaceRoot } from "./public-packages/package-set.ts";
import {
	candidatePublicationClassificationSchema,
	releaseCandidateSchema,
	releaseFailureSchema,
} from "./release/contracts.ts";
import type {
	CandidateFileGateway,
	CandidatePublicationClassification,
	FreshReleaseGateway,
	NpmCandidateGateway,
	NpmRegistryGateway,
	ReleaseCommandGateway,
	ReleaseConfirmationGateway,
	ReleaseDelay,
	ReleaseFailure,
	ReleaseProgressReporter,
	ReleaseReportStore,
	ReleaseTransactionReport,
	ResumeReleaseGateway,
} from "./release/contracts.ts";
import { planFreshRelease } from "./release/fresh.ts";
import {
	createNodeCandidateFileGateway,
	createNodeReleaseReportStore,
	createSystemFreshReleaseGateway,
	createSystemNpmCandidateGateway,
	createSystemNpmRegistryGateway,
	createSystemReleaseCommandGateway,
	createInteractiveReleaseConfirmationGateway,
	createSystemReleaseDelay,
	createSystemResumeReleaseGateway,
} from "./release/system.ts";
import { runReleaseTransaction } from "./release/transaction.ts";

const verificationDelaysMs = [2_000, 5_000, 10_000, 20_000] as const;

export interface ReleaseCliContext {
	readonly release: FreshReleaseGateway;
	readonly resume: ResumeReleaseGateway;
	readonly npmCandidates: NpmCandidateGateway;
	readonly reports: ReleaseReportStore;
	readonly candidateFiles: CandidateFileGateway;
	readonly registry: NpmRegistryGateway;
	readonly confirmation: ReleaseConfirmationGateway;
	readonly commands: ReleaseCommandGateway;
	readonly delay: ReleaseDelay;
	readonly reportPathForVersion: (version: string) => string;
	readonly releaseDirectoryForVersion: (version: string) => string;
	readonly verificationDelaysMs: readonly number[];
	readonly onProgress?: ReleaseProgressReporter;
}

interface ReleaseEvidence {
	readonly version: string;
	readonly mode: "fresh" | "resume" | "plan";
	readonly reportPath: string | null;
	readonly releaseCommit: string | null;
	readonly candidates: ReleaseTransactionReport["candidates"][number][];
	readonly classifications: CandidatePublicationClassification[];
	readonly writes: string[];
	readonly finalStatus: "planned" | "verified" | "refused";
	readonly releaseBranch?: string;
	readonly stages?: string[];
	readonly packages?: string[];
	readonly error?: ReleaseFailure;
}

export const releasePublicPackageSetRequestSchema = z.object({
	version: z.string().describe("Concrete npm version to plan or release."),
	plan: z.boolean().default(false).describe("Run only the read-only fresh-release preflight."),
	yes: z.boolean().default(false).describe("Publish without an interactive confirmation."),
});
export const releaseCliResultSchema = z.strictObject({
	version: z.string(),
	mode: z.enum(["fresh", "resume", "plan"]),
	reportPath: z.string().nullable(),
	releaseCommit: z.string().nullable(),
	candidates: z.array(releaseCandidateSchema),
	classifications: z.array(candidatePublicationClassificationSchema),
	writes: z.array(z.string()),
	finalStatus: z.enum(["planned", "verified", "refused"]),
	releaseBranch: z.string().optional(),
	stages: z.array(z.string()).optional(),
	packages: z.array(z.string()).optional(),
	error: releaseFailureSchema.optional(),
});
export type ReleaseCliResult = z.output<typeof releaseCliResultSchema>;

export async function runReleasePublicPackageSet(
	context: NsDevCliContext,
	request: z.output<typeof releasePublicPackageSetRequestSchema>,
): Promise<ClinkrExit<ReleaseCliResult, unknown, unknown, unknown>> {
	if (!request.plan && !request.yes && !context.interaction.isInteractive()) {
		return usageError("Publishing non-interactively requires --yes.", {
			missingFlag: "--yes",
			howToSupply: "Pass --yes to authorize npm publication without a prompt.",
		});
	}
	const releaseContext = context.release ?? createSystemReleaseCliContext(context);
	if (request.plan) return await runPlan(request.version, releaseContext);
	const confirmation: ReleaseConfirmationGateway = request.yes
		? {
				async confirmPublish() {
					return { ok: true, value: true };
				},
			}
		: createInteractiveReleaseConfirmationGateway(context.interaction);
	const onProgress: ReleaseProgressReporter | undefined =
		context.status === undefined
			? releaseContext.onProgress
			: (message) => context.status?.(`ns-dev release: ${message}\n`);
	return await runTransaction(request.version, {
		...releaseContext,
		confirmation,
		...(onProgress === undefined ? {} : { onProgress }),
	});
}

export function renderReleasePublicPackageSet(data: ReleaseCliResult): string {
	return `${JSON.stringify(data, null, 2)}\n`;
}

async function runPlan(
	version: string,
	context: ReleaseCliContext,
): Promise<ClinkrExit<ReleaseCliResult, unknown, unknown, unknown>> {
	const result = await planFreshRelease(context.release, version);
	if (result.type === "refused")
		return releaseFailure(
			{
				version,
				mode: "plan",
				reportPath: null,
				releaseCommit: null,
				candidates: [],
				classifications: [],
				writes: [],
				finalStatus: "refused",
			},
			result.error,
		);
	return ok({
		version,
		mode: "plan",
		reportPath: null,
		releaseCommit: null,
		candidates: [],
		classifications: [],
		writes: [],
		finalStatus: "planned",
		releaseBranch: result.plan.releaseBranch,
		stages: [...result.plan.stages],
		packages: [...result.plan.packages],
	});
}
async function runTransaction(
	version: string,
	context: ReleaseCliContext,
): Promise<ClinkrExit<ReleaseCliResult, unknown, unknown, unknown>> {
	const result = await runReleaseTransaction(context, version);
	return result.type === "verified"
		? ok({
				...result.evidence,
				candidates: [...result.evidence.candidates],
				classifications: [...result.evidence.classifications],
				writes: [...result.evidence.writes],
			})
		: releaseFailure(
				{
					...result.evidence,
					candidates: [...result.evidence.candidates],
					classifications: [...result.evidence.classifications],
					writes: [...result.evidence.writes],
				},
				result.error,
			);
}
function releaseFailure(
	evidence: ReleaseEvidence,
	error: ReleaseFailure,
): ClinkrExit<ReleaseCliResult, unknown, unknown, unknown> {
	return failure(error.code, error.message, { ...evidence, error, finalStatus: "refused" });
}

export function createSystemReleaseCliContext(
	context: Pick<NsDevCliContext, "env" | "interaction" | "runCommand" | "status" | "timers">,
): ReleaseCliContext {
	const runCommand: CommandRunner = async (command, args, options = {}) => {
		const upstreamOnStderr = options.onStderr;
		return await context.runCommand(command, args, {
			...options,
			env: context.env,
			...(context.status === undefined
				? {}
				: {
						onStderr(text: string) {
							upstreamOnStderr?.(text);
							context.status?.(text);
						},
					}),
		});
	};
	return {
		release: createSystemFreshReleaseGateway({ runCommand }),
		resume: createSystemResumeReleaseGateway({ runCommand }),
		npmCandidates: createSystemNpmCandidateGateway({ cwd: repoRoot, runCommand }),
		reports: createNodeReleaseReportStore(),
		candidateFiles: createNodeCandidateFileGateway(),
		registry: createSystemNpmRegistryGateway({ runCommand }),
		confirmation: createInteractiveReleaseConfirmationGateway(context.interaction),
		commands: createSystemReleaseCommandGateway({ runCommand }),
		delay: createSystemReleaseDelay(context.timers),
		reportPathForVersion: (version) =>
			resolve(workspaceRoot, "dist", "releases", version, "report.json"),
		releaseDirectoryForVersion: (version) => resolve(workspaceRoot, "dist", "releases", version),
		verificationDelaysMs,
	};
}
