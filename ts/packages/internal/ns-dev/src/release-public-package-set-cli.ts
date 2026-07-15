#!/usr/bin/env node

import { resolve } from "node:path";

import { ClinkrGroup, failure, ok } from "@nseng-ai/clinkr";
import { defineCli, type CliEntrypointDeps } from "@nseng-ai/foundation/cli-runtime";
import { z } from "zod";

import {
	executeReleasePublication,
	planFreshRelease,
	recoverCheckpointingReport,
	startFreshRelease,
	validateReleaseResume,
	type CandidateFileGateway,
	type CandidatePublicationClassification,
	type FreshReleaseGateway,
	type NpmCandidateGateway,
	type NpmRegistryGateway,
	type ReleaseCommandGateway,
	type ReleaseConfirmationGateway,
	type ReleaseDelay,
	type ReleaseFailure,
	type ReleaseReportStore,
	type ReleaseTransactionReport,
	type ResumeReleaseGateway,
} from "../../../../scripts/release-transaction-core.ts";
import {
	createNodeCandidateFileGateway,
	createNodeReleaseReportStore,
	createSystemFreshReleaseGateway,
	createSystemNpmCandidateGateway,
	createSystemNpmRegistryGateway,
	createSystemReleaseCommandGateway,
	createSystemReleaseDelay,
	createSystemResumeReleaseGateway,
	createTtyReleaseConfirmationGateway,
} from "../../../../scripts/release-transaction-system.ts";
import { repoRoot, workspaceRoot } from "../../../../scripts/public-package-set.mjs";

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
	readonly releaseBranch?: string | undefined;
	readonly stages?: string[] | undefined;
	readonly packages?: string[] | undefined;
}

interface ReleaseCliDeps extends CliEntrypointDeps {
	readonly context?: ReleaseCliContext;
}

const requestSchema = z.strictObject({
	version: z.string().describe("Concrete npm version to plan or release."),
	plan: z.boolean().default(false).describe("Run only the read-only fresh-release preflight."),
});
const candidateSchema = z.strictObject({
	name: z.string(),
	version: z.string(),
	tarballPath: z.string(),
	integrity: z.string(),
	shasum: z.string(),
	order: z.number(),
});
const releaseFailureSchema = z.strictObject({ code: z.string(), message: z.string() });
const registryClassificationSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("missing") }),
	z.strictObject({ type: z.literal("published-exact") }),
	z.strictObject({
		type: z.literal("published-mismatch"),
		actual: z.strictObject({ integrity: z.string(), shasum: z.string() }),
	}),
	z.strictObject({ type: z.literal("registry-error"), error: releaseFailureSchema }),
]);
const classificationSchema = z.strictObject({
	candidate: candidateSchema,
	classification: registryClassificationSchema,
});
const resultSchema = z.strictObject({
	version: z.string(),
	mode: z.enum(["fresh", "resume", "plan"]),
	reportPath: z.string().nullable(),
	releaseCommit: z.string().nullable(),
	candidates: z.array(candidateSchema),
	classifications: z.array(classificationSchema),
	writes: z.array(z.string()),
	finalStatus: z.enum(["planned", "verified", "refused"]),
	releaseBranch: z.string().optional(),
	stages: z.array(z.string()).optional(),
	packages: z.array(z.string()).optional(),
});

const entry = defineCli<ReleaseCliContext, ReleaseCliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Plan, run, or safely resume the transactional public npm package release.",
	prepareRun: ({ deps }) => ({
		type: "run",
		context: deps.context ?? createSystemReleaseCliContext(),
		buildState: undefined,
	}),
	buildCli: ({ version }) => {
		const root = new ClinkrGroup<ReleaseCliContext>({
			name: "release",
			description: "Plan, run, or safely resume the transactional public npm package release.",
			version,
			runtimeInfo: () =>
				"runtime: typescript\nentry_point: @internal/ns-dev release tooling -> ts/scripts/release-public-package-set.ts\n",
		});
		root.defaultCommand({
			schema: requestSchema,
			positionals: { version: { position: 0 } },
			options: { plan: { short: "-n" } },
			resultSchema,
			handler: async (context, request) =>
				request.plan
					? await runPlan(request.version, context)
					: await runTransaction(request.version, context),
			renderHuman: (data) => `${JSON.stringify(data, null, 2)}\n`,
		});
		return root;
	},
});

export const VERSION = entry.version;

/** Testable Clinkr CLI adapter. All release capabilities are injected. */
export async function runReleaseCli(
	args: readonly string[],
	context: ReleaseCliContext,
	io: Pick<CliEntrypointDeps, "stdout" | "stderr"> = {},
): Promise<number> {
	return await entry.run(
		args.filter((arg) => arg !== "--"),
		{ context, ...io },
	);
}

async function runPlan(version: string, context: ReleaseCliContext) {
	const result = await planFreshRelease(context.release, version);
	if (result.type === "refused") {
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
	}
	return ok({
		version,
		mode: "plan" as const,
		reportPath: null,
		releaseCommit: null,
		candidates: [],
		classifications: [],
		writes: [],
		finalStatus: "planned" as const,
		releaseBranch: result.plan.releaseBranch,
		stages: [...result.plan.stages],
		packages: [...result.plan.packages],
	});
}

async function runTransaction(version: string, context: ReleaseCliContext) {
	const reportPath = context.reportPathForVersion(version);
	const loaded = await context.reports.read(reportPath);
	let mode: "fresh" | "resume";
	let report: ReleaseTransactionReport;
	if (loaded.type === "error") {
		return releaseFailure(emptyEvidence(version, "resume", reportPath), loaded.error);
	}
	if (loaded.type === "found") {
		mode = "resume";
		const resumeEvidence = evidenceFromReport(version, mode, reportPath, loaded.value);
		if (loaded.value.release.version !== version) {
			return releaseFailure(resumeEvidence, {
				code: "wrong-requested-version",
				message: `Report version ${loaded.value.release.version} does not match requested version ${version}`,
			});
		}
		const identity = await context.resume.inspectResumeState();
		if (!identity.ok) return releaseFailure(resumeEvidence, identity.error);
		if (!identity.value.isWorktreeClean) {
			return releaseFailure(resumeEvidence, {
				code: "release-worktree-dirty",
				message: "Resuming a release requires a clean worktree",
			});
		}
		const validationOptions = {
			reportPath,
			currentBranch: identity.value.currentBranch,
			headCommit: identity.value.headCommit,
			coordinatedVersion: identity.value.coordinatedVersion,
		};
		const validated =
			loaded.value.stage === "checkpointing"
				? await recoverCheckpointingReport(
						{ reports: context.reports, candidateFiles: context.candidateFiles },
						{ ...validationOptions, headParentCommit: identity.value.headParentCommit },
					)
				: await validateReleaseResume(
						{ reports: context.reports, candidateFiles: context.candidateFiles },
						validationOptions,
					);
		if (validated.type === "refused") {
			return releaseFailure(resumeEvidence, {
				code: validated.code,
				message: validated.message,
			});
		}
		report = validated.report;
	} else {
		mode = "fresh";
		const started = await startFreshRelease(
			{ release: context.release, npmCandidates: context.npmCandidates, reports: context.reports },
			{
				version,
				reportPath,
				releaseDirectory: context.releaseDirectoryForVersion(version),
			},
		);
		if (started.type === "refused") {
			return releaseFailure(emptyEvidence(version, mode, reportPath), started.error);
		}
		report = started.report;
	}

	const executed = await executeReleasePublication(
		{
			registry: context.registry,
			confirmation: context.confirmation,
			commands: context.commands,
			reports: context.reports,
			delay: context.delay,
		},
		{ report, reportPath, verificationDelaysMs: context.verificationDelaysMs },
	);
	const evidence: ReleaseEvidence = {
		version,
		mode,
		reportPath,
		releaseCommit: report.release.commit,
		candidates: executed.plan.candidates.map((candidate) => ({ ...candidate })),
		classifications: executed.plan.classifications.map((classification) => ({
			candidate: { ...classification.candidate },
			classification: classification.classification,
		})),
		writes: [...executed.report.completedWrites],
		finalStatus: "verified",
	};
	return executed.type === "verified"
		? ok(evidence)
		: releaseFailure({ ...evidence, finalStatus: "verified" }, executed.error);
}

function evidenceFromReport(
	version: string,
	mode: "fresh" | "resume",
	reportPath: string,
	report: ReleaseTransactionReport,
): ReleaseEvidence {
	return {
		version,
		mode,
		reportPath,
		releaseCommit: report.release.commit,
		candidates: report.candidates.map((candidate) => ({ ...candidate })),
		classifications: [],
		writes: [...report.completedWrites],
		finalStatus: "verified",
	};
}

function emptyEvidence(
	version: string,
	mode: "fresh" | "resume",
	reportPath: string,
): ReleaseEvidence {
	return {
		version,
		mode,
		reportPath,
		releaseCommit: null,
		candidates: [],
		classifications: [],
		writes: [],
		finalStatus: "verified",
	};
}

function releaseFailure(evidence: ReleaseEvidence, error: ReleaseFailure) {
	return failure(error.code, error.message, { ...evidence, finalStatus: "refused" });
}

export function createSystemReleaseCliContext(): ReleaseCliContext {
	return {
		release: createSystemFreshReleaseGateway(),
		resume: createSystemResumeReleaseGateway(),
		npmCandidates: createSystemNpmCandidateGateway({ cwd: repoRoot }),
		reports: createNodeReleaseReportStore(),
		candidateFiles: createNodeCandidateFileGateway(),
		registry: createSystemNpmRegistryGateway(),
		confirmation: createTtyReleaseConfirmationGateway(),
		commands: createSystemReleaseCommandGateway(),
		delay: createSystemReleaseDelay(),
		reportPathForVersion: (version) =>
			resolve(workspaceRoot, "dist", "releases", version, "report.json"),
		releaseDirectoryForVersion: (version) => resolve(workspaceRoot, "dist", "releases", version),
		verificationDelaysMs,
	};
}

export async function runSystemReleaseCliIfMain(argv: readonly string[]): Promise<void> {
	const executable = argv[0] ?? "node";
	const entryPath = argv[1] ?? "release";
	await entry.runIfMain({
		isImportMetaMain: true,
		argv: [executable, entryPath, ...argv.slice(2).filter((arg) => arg !== "--")],
	});
}
