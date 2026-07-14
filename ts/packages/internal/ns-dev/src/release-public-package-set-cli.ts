#!/usr/bin/env node

import { resolve } from "node:path";

import { ClinkrGroup, failure, ok } from "@nseng-ai/clinkr";
import { defineCli, type CliEntrypointDeps } from "@nseng-ai/foundation/cli-runtime";
import { z } from "zod";

import {
	candidatePublicationClassificationSchema,
	releaseCandidateSchema,
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
	createSystemReleaseDelay,
	createSystemResumeReleaseGateway,
	createTtyReleaseConfirmationGateway,
} from "./release/system.ts";
import { runReleaseTransaction } from "./release/transaction.ts";
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
			resultSchema: releaseCliResultSchema,
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
	return await entry.run(args, { context, ...io });
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
	const executableArgs = argv.slice(2);
	const normalizedArgs = executableArgs[0] === "--" ? executableArgs.slice(1) : executableArgs;
	await entry.runIfMain({
		isImportMetaMain: true,
		argv: [executable, entryPath, ...normalizedArgs],
	});
}
