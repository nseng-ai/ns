import type { ErrorInfo, Result } from "@nseng-ai/foundation/result";
import { z } from "zod";

import { isConcreteNpmVersion } from "../public-packages/package-set.ts";

const nonemptyStringSchema = z.string().min(1);
export const concreteNpmVersionSchema = z
	.string()
	.refine(isConcreteNpmVersion, "Expected a concrete npm semver version");

export const releaseTransactionStages = [
	"preparing-candidates",
	"candidates-prepared",
	"checkpointing",
	"publishing",
	"published",
	"verified",
] as const;
export const releaseTransactionStageSchema = z.enum(releaseTransactionStages);

export const releaseIdentitySchema = z
	.strictObject({
		branch: nonemptyStringSchema,
		commit: nonemptyStringSchema,
		version: concreteNpmVersionSchema,
	})
	.readonly();
export const releaseCandidateSchema = z
	.strictObject({
		name: nonemptyStringSchema,
		version: concreteNpmVersionSchema,
		tarballPath: nonemptyStringSchema.endsWith(".tgz"),
		integrity: nonemptyStringSchema,
		shasum: nonemptyStringSchema,
		order: z.number().int().nonnegative(),
	})
	.readonly();
export const releaseTransactionReportSchema = z
	.strictObject({
		schemaVersion: z.literal(1),
		release: releaseIdentitySchema,
		inventory: z.array(nonemptyStringSchema).readonly(),
		candidates: z.array(releaseCandidateSchema).readonly(),
		completedWrites: z.array(nonemptyStringSchema).readonly(),
		pendingWrite: nonemptyStringSchema.nullable(),
		stage: releaseTransactionStageSchema,
	})
	.readonly();
export const releaseFailureSchema = z
	.strictObject({
		code: nonemptyStringSchema,
		message: nonemptyStringSchema,
		details: z.record(z.string(), z.unknown()).optional(),
		displayCommand: nonemptyStringSchema.optional(),
	})
	.readonly();
export const registryPackageMetadataSchema = z
	.strictObject({
		integrity: nonemptyStringSchema,
		shasum: nonemptyStringSchema,
	})
	.readonly();
export const registryClassificationSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("missing") }),
	z.strictObject({ type: z.literal("published-exact") }),
	z.strictObject({ type: z.literal("published-mismatch"), actual: registryPackageMetadataSchema }),
	z.strictObject({ type: z.literal("registry-error"), error: releaseFailureSchema }),
]);
export const candidatePublicationClassificationSchema = z.strictObject({
	candidate: releaseCandidateSchema,
	classification: registryClassificationSchema,
});

export type ReleaseTransactionStage = z.infer<typeof releaseTransactionStageSchema>;
export type ReleaseIdentity = z.infer<typeof releaseIdentitySchema>;
export type ReleaseCandidate = z.infer<typeof releaseCandidateSchema>;
export type ReleaseTransactionReport = z.infer<typeof releaseTransactionReportSchema>;
export type ReleaseFailure = ErrorInfo;

export interface QualifiedPublishRoot {
	readonly name: string;
	readonly path: string;
}

export type OperationResult = Result<void, ReleaseFailure>;
export type ValueResult<T> = Result<T, ReleaseFailure>;
export type OptionalResult<T> =
	| { readonly type: "found"; readonly value: T }
	| { readonly type: "missing" }
	| { readonly type: "error"; readonly error: ReleaseFailure };

export interface NpmCandidateGateway {
	pack(options: {
		readonly publishRoot: string;
		readonly packDestination: string;
	}): Promise<ValueResult<Omit<ReleaseCandidate, "order">>>;
}

export interface ReleaseReportStore {
	read(reportPath: string): Promise<OptionalResult<ReleaseTransactionReport>>;
	writeAtomic(reportPath: string, report: ReleaseTransactionReport): Promise<OperationResult>;
}

export type CandidateFileState =
	| { readonly type: "exact" }
	| { readonly type: "missing" }
	| {
			readonly type: "hash-mismatch";
			readonly actualIntegrity: string;
			readonly actualShasum: string;
	  }
	| { readonly type: "error"; readonly error: ReleaseFailure };

export interface CandidateFileGateway {
	classify(candidate: ReleaseCandidate): Promise<CandidateFileState>;
}

export type RegistryPackageMetadata = z.infer<typeof registryPackageMetadataSchema>;

export interface NpmRegistryGateway {
	readPackageMetadata(
		name: string,
		version: string,
	): Promise<OptionalResult<RegistryPackageMetadata>>;
}

export interface ReleaseConfirmationGateway {
	confirmPublish(version: string): Promise<ValueResult<boolean>>;
}

export type ReleaseProgressReporter = (message: string) => void;

export interface ReleaseCommandGateway {
	publishTarball(tarballPath: string): Promise<OperationResult>;
	verify(options: {
		readonly version: string;
		readonly candidateReportPath: string;
	}): Promise<OperationResult>;
}

export const releaseResetTrackedChangeSchema = z
	.strictObject({
		path: nonemptyStringSchema,
		indexChanged: z.boolean(),
		worktreeChanged: z.boolean(),
		isUnexpectedStatus: z.boolean().optional(),
	})
	.readonly();
export const releaseResetManifestStateSchema = z
	.strictObject({
		packageName: nonemptyStringSchema,
		path: nonemptyStringSchema,
		headVersion: concreteNpmVersionSchema,
		workingVersion: concreteNpmVersionSchema,
		changedFields: z.array(nonemptyStringSchema).readonly(),
		isExactVersionOnlyChange: z.boolean(),
	})
	.readonly();
export const releaseResetReportStateSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("missing") }),
	z.strictObject({
		type: z.literal("found"),
		report: releaseTransactionReportSchema,
		isCommitAncestorOfHead: z.boolean(),
	}),
	z.strictObject({
		type: z.literal("error"),
		errorType: z.enum(["read-error", "parse-error"]),
		error: releaseFailureSchema,
	}),
]);
export const releaseResetInspectionSchema = z
	.strictObject({
		currentSourceBranch: nonemptyStringSchema,
		headCommit: nonemptyStringSchema,
		releaseBranch: nonemptyStringSchema,
		releaseBranchExists: z.boolean(),
		manifests: z.array(releaseResetManifestStateSchema).readonly(),
		trackedChanges: z.array(releaseResetTrackedChangeSchema).readonly(),
		untrackedPaths: z.array(nonemptyStringSchema).readonly(),
		releaseDirectory: nonemptyStringSchema.nullable(),
		releaseDirectoryFingerprint: nonemptyStringSchema.nullable(),
		report: releaseResetReportStateSchema,
	})
	.readonly();

export type ReleaseResetTrackedChange = z.infer<typeof releaseResetTrackedChangeSchema>;
export type ReleaseResetManifestState = z.infer<typeof releaseResetManifestStateSchema>;
export type ReleaseResetReportState = z.infer<typeof releaseResetReportStateSchema>;
export type ReleaseResetInspection = z.infer<typeof releaseResetInspectionSchema>;

/** Consumer Gateway for release-reset inspection and its two exact cleanup effects. */
export interface ReleaseResetGateway {
	inspectResetState(options: {
		readonly version: string;
		readonly releaseBranch: string;
	}): Promise<ValueResult<ReleaseResetInspection>>;
	restoreTrackedReleasePaths(paths: readonly string[]): Promise<OperationResult>;
	removeReleaseDirectory(options: {
		readonly version: string;
		readonly plannedPath: string;
	}): Promise<OperationResult>;
}

export interface FreshReleaseState {
	readonly currentBranch: string;
	readonly headCommit: string;
	readonly trunkBranch: string;
	readonly isGraphiteTracked: boolean;
	readonly isWorktreeClean: boolean;
	readonly releaseBranchExists: boolean;
	readonly sourceManifestPaths: readonly string[];
}

export interface ReleaseCheckpoint {
	readonly branch: string;
	readonly commit: string;
	readonly isWorktreeClean: boolean;
}

export interface FreshReleaseGateway {
	inspectFreshState(releaseBranch: string): Promise<ValueResult<FreshReleaseState>>;
	bumpCoordinatedVersion(version: string): Promise<OperationResult>;
	qualifyPublicPackages(version: string): Promise<ValueResult<readonly QualifiedPublishRoot[]>>;
	listTrackedChanges(): Promise<ValueResult<readonly string[]>>;
	stageReleaseFiles(paths: readonly string[]): Promise<OperationResult>;
	createReleaseCheckpoint(options: {
		readonly branch: string;
		readonly message: string;
	}): Promise<ValueResult<ReleaseCheckpoint>>;
	inspectCheckpoint(): Promise<ValueResult<ReleaseCheckpoint>>;
}

export interface FreshReleasePlan {
	readonly version: string;
	readonly releaseBranch: string;
	readonly stages: readonly string[];
	readonly packages: readonly string[];
}

export type PlanFreshReleaseResult =
	| { readonly type: "planned"; readonly plan: FreshReleasePlan }
	| { readonly type: "refused"; readonly error: ReleaseFailure };

export interface StartFreshReleaseContext {
	readonly release: FreshReleaseGateway;
	readonly npmCandidates: NpmCandidateGateway;
	readonly reports: ReleaseReportStore;
	readonly onProgress?: ReleaseProgressReporter;
}

export interface StartFreshReleaseOptions {
	readonly version: string;
	readonly reportPath: string;
	readonly releaseDirectory?: string;
}

export type StartFreshReleaseResult =
	| { readonly type: "checkpointed"; readonly report: ReleaseTransactionReport }
	| { readonly type: "refused"; readonly error: ReleaseFailure };

export interface ReleaseDelay {
	wait(delayMs: number): Promise<void>;
}

export interface PrepareCandidatesContext {
	readonly npmCandidates: NpmCandidateGateway;
	readonly reports: ReleaseReportStore;
	readonly onProgress?: ReleaseProgressReporter;
}

export interface PrepareCandidatesOptions {
	readonly identity: ReleaseIdentity;
	readonly publishRoots: readonly QualifiedPublishRoot[];
	readonly reportPath: string;
	readonly releaseDirectory?: string;
}

export type PrepareCandidatesResult =
	| { readonly type: "prepared"; readonly report: ReleaseTransactionReport }
	| {
			readonly type: "refused";
			readonly error: ReleaseFailure;
			readonly report: ReleaseTransactionReport;
	  };

export type ResumeRefusalCode =
	| "report-missing"
	| "report-read-error"
	| "wrong-branch"
	| "wrong-commit"
	| "wrong-parent-commit"
	| "wrong-version"
	| "wrong-inventory"
	| "candidate-inventory-mismatch"
	| "candidate-missing"
	| "candidate-hash-mismatch"
	| "candidate-read-error"
	| "report-not-checkpointing"
	| "recovered-report-write-failed";

export type ResumeValidationResult =
	| { readonly type: "valid"; readonly report: ReleaseTransactionReport }
	| { readonly type: "refused"; readonly code: ResumeRefusalCode; readonly message: string };

export interface ResumeReleaseState {
	readonly currentBranch: string;
	readonly headCommit: string;
	readonly headParentCommit: string;
	readonly isWorktreeClean: boolean;
	readonly coordinatedVersion: string;
}

export interface ResumeReleaseGateway {
	inspectResumeState(): Promise<ValueResult<ResumeReleaseState>>;
}

export interface ValidateResumeOptions {
	readonly reportPath: string;
	readonly currentBranch: string;
	readonly headCommit: string;
	readonly coordinatedVersion: string;
}

export interface RecoverCheckpointingOptions extends ValidateResumeOptions {
	readonly headParentCommit: string;
}

export type RegistryClassification = z.infer<typeof registryClassificationSchema>;
export type CandidatePublicationClassification = z.infer<
	typeof candidatePublicationClassificationSchema
>;

export interface ReleaseExecutionPlan {
	readonly releaseCommit: string;
	readonly candidates: readonly ReleaseCandidate[];
	readonly classifications: readonly CandidatePublicationClassification[];
	readonly tarballWritePlan: readonly string[];
}

export interface ExecuteReleaseContext {
	readonly registry: NpmRegistryGateway;
	readonly confirmation: ReleaseConfirmationGateway;
	readonly commands: ReleaseCommandGateway;
	readonly reports: ReleaseReportStore;
	readonly delay: ReleaseDelay;
	readonly onProgress?: ReleaseProgressReporter;
}

export interface ExecuteReleaseOptions {
	readonly report: ReleaseTransactionReport;
	readonly reportPath: string;
	readonly verificationDelaysMs: readonly number[];
}

export type ExecuteReleaseResult =
	| {
			readonly type: "verified";
			readonly plan: ReleaseExecutionPlan;
			readonly report: ReleaseTransactionReport;
	  }
	| {
			readonly type: "refused";
			readonly plan: ReleaseExecutionPlan;
			readonly error: ReleaseFailure;
			readonly report: ReleaseTransactionReport;
	  };
