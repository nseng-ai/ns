// Constructor-state in-memory fakes for prompt and Saved Plan dispatch gateways.
import { FakeBrmemGateway, type BrmemResult, type PutEntryResult } from "@nseng-ai/brmem";
import type { Clock } from "@nseng-ai/foundation/clock";
import { noopNsProgress } from "@nseng-ai/sdk";
import type {
	ExecResult,
	NsCommandIo,
	NsExtensionApi,
	TextGenerationRequest,
	TextGenerationResult,
} from "@nseng-ai/sdk";

import type {
	DispatchAnchorBranchAvailabilityResult,
	DispatchAnchorPrGateway,
	DispatchConfigGateway,
	DispatchConfigSourceResult,
	DispatchContentSlugGateway,
	DispatchContentSlugInput,
	DispatchContentSlugResult,
	DispatchGitOperationResult,
	DispatchGraphitePublicationAuthorizationGateway,
	DispatchGraphitePublicationAuthorizationResult,
	DispatchGraphitePublicationPlan,
	DispatchGraphitePublicationPlanResult,
	DispatchGraphitePublicationResult,
	DispatchLocalTokenGateway,
	DispatchLocalTokenResult,
	DispatchPlanGateways,
	DispatchPromptGateways,
	DispatchRemoteBranchTipResult,
	DispatchSourcePublicationGateway,
	DispatchStartRunResult,
	DispatchTriggerConnection,
	DispatchTriggerGateway,
	DispatchTriggerIdentityResult,
	DispatchWorkspaceGitGateway,
} from "../../../src/dispatch-client/contracts.ts";
import type { DispatchRunInput } from "../../../src/dispatch/dispatch-run.ts";
import type { DispatchPlanSnapshotGateway } from "../../../src/dispatch-client/dispatch-plan/delivery.ts";
import type {
	DispatchSavedPlanGateway,
	DispatchSavedPlanResolution,
} from "../../../src/dispatch-client/dispatch-plan/preparation.ts";

export const FAKE_HEAD_SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
export const FAKE_DISPATCH_ID = "dsp_01JABCDEF0123456789";
export const FAKE_PLAN_REF = "/state/ns/enriched-plan/ns/main/add-cache.md";
export const FAKE_PLAN_SNAPSHOT_COMMIT = "1111111111111111111111111111111111111111";
export const FAKE_REWRITTEN_HEAD_SHA = "c3d4e5f60718293a4b5c6d7e8f9012345678a1b2";
export const FAKE_SEMANTIC_SLUG = "rename-widget-gateway-methods";
export const FAKE_NOW_MS = Date.UTC(2026, 6, 15, 14, 18, 14);
export const FAKE_ANCHOR_TIMESTAMP = "20260715-071814";
export const FAKE_RUN_ID = "wf_run_0123456789";
export const FAKE_DEPLOYMENT_URL = "https://ns-dispatch.example.vercel.app";
export const FAKE_WORKFLOW_DASHBOARD_URL = "https://vercel.com/example-team/ns-dispatch/workflows";
export const FAKE_WORKFLOW_RUN_URL = `${FAKE_WORKFLOW_DASHBOARD_URL}/runs/${FAKE_RUN_ID}?environment=production`;
export const FAKE_OIDC_TOKEN = "fake-development-oidc-token";

export const FAKE_DISPATCH_SETTINGS_SOURCE = [
	"[dispatch]",
	'harness = "pi"',
	'vercel_project_id = "prj_Fake123"',
	'vercel_team_id = "team_Fake123"',
	`workflow_dashboard_url = "${FAKE_WORKFLOW_DASHBOARD_URL}"`,
	`deployment_url = "${FAKE_DEPLOYMENT_URL}"`,
	'anchor_timezone = "America/Los_Angeles"',
	"",
].join("\n");

export const FAKE_PACKAGE_MANAGER_SOURCE = JSON.stringify({ packageManager: "pnpm@11.8.1" });

interface FakeSourcePatch {
	readonly repoRoot?: string;
	readonly branch?: string;
	readonly headSha?: string;
	readonly isDetachedHead?: boolean;
	readonly isNotARepository?: boolean;
	readonly dirtyPaths?: readonly string[];
	readonly dirtyReadError?: { readonly code: string; readonly message: string };
	readonly remoteTip?: DispatchRemoteBranchTipResult;
}

export interface FakeWorkspaceGitState extends FakeSourcePatch {
	readonly occupiedAnchorBranches?: readonly string[];
	readonly anchorAvailabilityError?: DispatchAnchorBranchAvailabilityResult;
	readonly sourcePushResult?: DispatchGitOperationResult;
	readonly anchorPushResult?: DispatchGitOperationResult;
	readonly afterGitPush?: FakeSourcePatch;
	readonly afterGraphitePublication?: FakeSourcePatch;
	readonly beforeFinalValidation?: FakeSourcePatch;
}

class FakeDispatchRepositoryState {
	repoRoot: string;
	branch: string;
	headSha: string;
	isDetachedHead: boolean;
	isNotARepository: boolean;
	dirtyPaths: string[];
	dirtyReadError: { readonly code: string; readonly message: string } | undefined;
	remoteTip: DispatchRemoteBranchTipResult;
	hasSourcePublication = false;
	isFinalValidationReady = false;
	readonly afterGitPush: FakeSourcePatch;
	readonly afterGraphitePublication: FakeSourcePatch;
	readonly beforeFinalValidation: FakeSourcePatch;

	constructor(state: FakeWorkspaceGitState) {
		this.repoRoot = state.repoRoot ?? "/repo";
		this.branch = state.branch ?? "feature/widgets";
		this.headSha = state.headSha ?? FAKE_HEAD_SHA;
		this.isDetachedHead = state.isDetachedHead ?? false;
		this.isNotARepository = state.isNotARepository ?? false;
		this.dirtyPaths = [...(state.dirtyPaths ?? [])];
		this.dirtyReadError = state.dirtyReadError;
		this.remoteTip = copyRemoteTip(state.remoteTip ?? { type: "found", sha: this.headSha });
		this.afterGitPush = copySourcePatch(state.afterGitPush ?? {});
		this.afterGraphitePublication = copySourcePatch(state.afterGraphitePublication ?? {});
		this.beforeFinalValidation = copySourcePatch(state.beforeFinalValidation ?? {});
	}

	applyGitPush(expectedRevision: string): void {
		this.hasSourcePublication = true;
		this.remoteTip = { type: "found", sha: expectedRevision };
		this.applyPatch(this.afterGitPush);
	}

	applyGraphitePublication(source: { readonly branch: string; readonly headSha: string }): void {
		this.hasSourcePublication = true;
		this.branch = source.branch;
		this.headSha = source.headSha;
		this.remoteTip = { type: "found", sha: source.headSha };
		this.applyPatch(this.afterGraphitePublication);
	}

	prepareFinalValidation(): void {
		if (this.isFinalValidationReady) return;
		this.isFinalValidationReady = true;
		this.applyPatch(this.beforeFinalValidation);
	}

	private applyPatch(patch: FakeSourcePatch): void {
		if (patch.repoRoot !== undefined) this.repoRoot = patch.repoRoot;
		if (patch.branch !== undefined) this.branch = patch.branch;
		if (patch.headSha !== undefined) this.headSha = patch.headSha;
		if (patch.isDetachedHead !== undefined) this.isDetachedHead = patch.isDetachedHead;
		if (patch.isNotARepository !== undefined) this.isNotARepository = patch.isNotARepository;
		if (patch.dirtyPaths !== undefined) this.dirtyPaths = [...patch.dirtyPaths];
		if (patch.dirtyReadError !== undefined) this.dirtyReadError = { ...patch.dirtyReadError };
		if (patch.remoteTip !== undefined) this.remoteTip = copyRemoteTip(patch.remoteTip);
	}
}

export class FakeDispatchWorkspaceGitGateway implements DispatchWorkspaceGitGateway {
	private readonly sourceRefReadLog: string[] = [];
	private readonly dirtyPathReadLog: string[] = [];
	private readonly remoteTipReadLog: Array<{ cwd: string; branch: string }> = [];
	private readonly anchorAvailabilityReadLog: Array<{ cwd: string; anchorBranch: string }> = [];
	private readonly sourcePushLog: Array<{ branch: string; expectedRevision: string }> = [];
	private readonly anchorPushLog: Array<{ revision: string; anchorBranch: string }> = [];
	private readonly repository: FakeDispatchRepositoryState;
	private readonly state: FakeWorkspaceGitState;
	private readonly recordOperation: (operation: string) => void;

	constructor(
		repository: FakeDispatchRepositoryState,
		state: FakeWorkspaceGitState = {},
		recordOperation = (_operation: string) => {},
	) {
		this.repository = repository;
		this.state = {
			...state,
			dirtyPaths: [...(state.dirtyPaths ?? [])],
			occupiedAnchorBranches: [...(state.occupiedAnchorBranches ?? [])],
		};
		this.recordOperation = recordOperation;
	}

	get sourceRefReads(): readonly string[] {
		return [...this.sourceRefReadLog];
	}

	get dirtyPathReads(): readonly string[] {
		return [...this.dirtyPathReadLog];
	}

	get remoteTipReads(): ReadonlyArray<{ readonly cwd: string; readonly branch: string }> {
		return this.remoteTipReadLog.map((entry) => ({ ...entry }));
	}

	get anchorAvailabilityReads(): ReadonlyArray<{
		readonly cwd: string;
		readonly anchorBranch: string;
	}> {
		return this.anchorAvailabilityReadLog.map((entry) => ({ ...entry }));
	}

	get sourcePushes(): ReadonlyArray<{
		readonly branch: string;
		readonly expectedRevision: string;
	}> {
		return this.sourcePushLog.map((entry) => ({ ...entry }));
	}

	get anchorPushes(): ReadonlyArray<{
		readonly revision: string;
		readonly anchorBranch: string;
	}> {
		return this.anchorPushLog.map((entry) => ({ ...entry }));
	}

	async resolveSourceRef(options: { readonly cwd: string }) {
		this.sourceRefReadLog.push(options.cwd);
		this.recordOperation("git:resolve-source-ref");
		if (this.repository.isNotARepository) {
			return {
				ok: false as const,
				error: { code: "not-a-repository" as const, message: "Not inside a git repository." },
			};
		}
		if (this.repository.isDetachedHead) {
			return {
				ok: false as const,
				error: {
					code: "detached-head" as const,
					message: "HEAD is detached; check out a branch first.",
				},
			};
		}
		return {
			ok: true as const,
			value: {
				repoRoot: this.repository.repoRoot,
				branch: this.repository.branch,
				headSha: this.repository.headSha,
			},
		};
	}

	async listDirtyPaths(options: { readonly cwd: string }) {
		this.dirtyPathReadLog.push(options.cwd);
		this.recordOperation("git:list-dirty-paths");
		if (this.repository.dirtyReadError !== undefined) {
			return { ok: false as const, error: { ...this.repository.dirtyReadError } };
		}
		return { ok: true as const, value: [...this.repository.dirtyPaths] };
	}

	async readRemoteBranchTip(options: { readonly cwd: string; readonly branch: string }) {
		this.remoteTipReadLog.push({ ...options });
		this.recordOperation("git:read-remote-tip");
		return copyRemoteTip(this.repository.remoteTip);
	}

	async isAnchorBranchNameAvailable(options: {
		readonly cwd: string;
		readonly anchorBranch: string;
	}) {
		this.anchorAvailabilityReadLog.push({ ...options });
		this.recordOperation("git:check-anchor-availability");
		if (this.state.anchorAvailabilityError !== undefined) {
			return this.state.anchorAvailabilityError;
		}
		if (this.state.occupiedAnchorBranches?.includes(options.anchorBranch) === true) {
			return { type: "occupied" } as const;
		}
		this.repository.prepareFinalValidation();
		return { type: "available" } as const;
	}

	async pushSourceBranch(options: {
		readonly cwd: string;
		readonly branch: string;
		readonly expectedRevision: string;
	}) {
		this.sourcePushLog.push({
			branch: options.branch,
			expectedRevision: options.expectedRevision,
		});
		this.recordOperation("git:push-source");
		const result = this.state.sourcePushResult ?? { ok: true as const };
		if (result.ok) this.repository.applyGitPush(options.expectedRevision);
		return result;
	}

	async pushAnchorBranch(options: {
		readonly cwd: string;
		readonly revision: string;
		readonly anchorBranch: string;
	}) {
		this.anchorPushLog.push({ revision: options.revision, anchorBranch: options.anchorBranch });
		this.recordOperation("git:push-anchor");
		return this.state.anchorPushResult ?? { ok: true as const };
	}
}

export interface FakeSourcePublicationState {
	readonly plan?: DispatchGraphitePublicationPlanResult;
	readonly publish?: DispatchGraphitePublicationResult;
}

export class FakeDispatchSourcePublicationGateway implements DispatchSourcePublicationGateway {
	private readonly planLog: Array<{ expectedBranch: string; expectedHeadSha: string }> = [];
	private readonly publicationLog: Array<{
		expectedBranch: string;
		expectedHeadSha: string;
		expectedPlan: DispatchGraphitePublicationPlan;
		restack: true;
		force: false;
	}> = [];
	private readonly repository: FakeDispatchRepositoryState;
	private readonly state: FakeSourcePublicationState;
	private readonly recordOperation: (operation: string) => void;

	constructor(
		repository: FakeDispatchRepositoryState,
		state: FakeSourcePublicationState = {},
		recordOperation = (_operation: string) => {},
	) {
		this.repository = repository;
		this.state = state;
		this.recordOperation = recordOperation;
	}

	get plans(): ReadonlyArray<{
		readonly expectedBranch: string;
		readonly expectedHeadSha: string;
	}> {
		return this.planLog.map((entry) => ({ ...entry }));
	}

	get publications(): ReadonlyArray<{
		readonly expectedBranch: string;
		readonly expectedHeadSha: string;
		readonly expectedPlan: DispatchGraphitePublicationPlan;
		readonly restack: true;
		readonly force: false;
	}> {
		return this.publicationLog.map((entry) => ({
			...entry,
			expectedPlan: {
				...entry.expectedPlan,
				affectedBranches: [...entry.expectedPlan.affectedBranches],
			},
		}));
	}

	async planGraphitePublication(options: {
		readonly expectedBranch: string;
		readonly expectedHeadSha: string;
	}) {
		this.planLog.push({ ...options });
		this.recordOperation("publication:plan");
		return this.state.plan ?? { type: "not-graphite-tracked" as const };
	}

	async publishGraphiteSource(options: {
		readonly expectedBranch: string;
		readonly expectedHeadSha: string;
		readonly expectedPlan: DispatchGraphitePublicationPlan;
		readonly onPhase?: (
			stage: "planning" | "readiness" | "restack" | "readiness-recheck" | "submit" | "verification",
		) => void;
	}) {
		this.publicationLog.push({
			expectedBranch: options.expectedBranch,
			expectedHeadSha: options.expectedHeadSha,
			expectedPlan: {
				...options.expectedPlan,
				affectedBranches: [...options.expectedPlan.affectedBranches],
			},
			restack: true,
			force: false,
		});
		this.recordOperation("publication:publish");
		options.onPhase?.("planning");
		const result =
			this.state.publish ??
			({
				type: "published",
				source: { branch: options.expectedBranch, headSha: options.expectedHeadSha },
				mutation: { local: "none", remote: "observed" },
			} as const);
		if (result.type === "published") this.repository.applyGraphitePublication(result.source);
		return result;
	}
}

export interface FakePublicationAuthorizationState {
	readonly isInteractive?: boolean;
	readonly interactiveResult?: "authorized" | "declined";
}

export class FakeDispatchPublicationAuthorizationGateway implements DispatchGraphitePublicationAuthorizationGateway {
	private readonly requestLog: Array<{
		affectedBranches: readonly string[];
		isForceAuthorized: boolean;
	}> = [];
	private readonly state: FakePublicationAuthorizationState;
	private readonly recordOperation: (operation: string) => void;

	constructor(
		state: FakePublicationAuthorizationState = {},
		recordOperation = (_operation: string) => {},
	) {
		this.state = state;
		this.recordOperation = recordOperation;
	}

	get requests(): ReadonlyArray<{
		readonly affectedBranches: readonly string[];
		readonly isForceAuthorized: boolean;
	}> {
		return this.requestLog.map((entry) => ({
			affectedBranches: [...entry.affectedBranches],
			isForceAuthorized: entry.isForceAuthorized,
		}));
	}

	async authorizeGraphitePublication(options: {
		readonly affectedBranches: readonly string[];
		readonly isForceAuthorized: boolean;
	}): Promise<DispatchGraphitePublicationAuthorizationResult> {
		this.requestLog.push({
			affectedBranches: [...options.affectedBranches],
			isForceAuthorized: options.isForceAuthorized,
		});
		this.recordOperation("publication:authorize");
		if (options.isForceAuthorized) return { type: "authorized", method: "force" };
		if (this.state.isInteractive !== true) return { type: "non-interactive-force-required" };
		return this.state.interactiveResult === "authorized"
			? { type: "authorized", method: "interactive" }
			: { type: "declined" };
	}
}

export interface FakeAnchorPrState {
	readonly prNumber?: number;
	readonly prUrl?: string;
	readonly openResult?: { readonly ok: false; readonly error: { code: string; message: string } };
	readonly stampResult?: DispatchGitOperationResult;
}

export class FakeDispatchAnchorPrGateway implements DispatchAnchorPrGateway {
	private readonly openedLog: Array<{
		anchorBranch: string;
		baseBranch: string;
		title: string;
		body: string;
	}> = [];
	private readonly stampLog: Array<{ prNumber: number; runId: string }> = [];
	private readonly state: FakeAnchorPrState;
	private readonly recordOperation: (operation: string) => void;

	constructor(state: FakeAnchorPrState = {}, recordOperation = (_operation: string) => {}) {
		this.state = state;
		this.recordOperation = recordOperation;
	}

	get opened(): ReadonlyArray<{
		readonly anchorBranch: string;
		readonly baseBranch: string;
		readonly title: string;
		readonly body: string;
	}> {
		return this.openedLog.map((entry) => ({ ...entry }));
	}

	get stamps(): ReadonlyArray<{ readonly prNumber: number; readonly runId: string }> {
		return this.stampLog.map((entry) => ({ ...entry }));
	}

	async openAnchorPr(options: {
		readonly cwd: string;
		readonly anchorBranch: string;
		readonly baseBranch: string;
		readonly title: string;
		readonly body: string;
	}) {
		this.openedLog.push({
			anchorBranch: options.anchorBranch,
			baseBranch: options.baseBranch,
			title: options.title,
			body: options.body,
		});
		this.recordOperation("anchor-pr:open");
		if (this.state.openResult !== undefined) return this.state.openResult;
		const number = this.state.prNumber ?? 41;
		return {
			ok: true as const,
			value: { number, url: this.state.prUrl ?? `https://github.com/nseng-ai/ns/pull/${number}` },
		};
	}

	async stampAnchorPrRunId(options: {
		readonly cwd: string;
		readonly prNumber: number;
		readonly runId: string;
	}) {
		this.stampLog.push({ prNumber: options.prNumber, runId: options.runId });
		this.recordOperation("anchor-pr:stamp-run-id");
		return this.state.stampResult ?? { ok: true as const };
	}
}

export interface FakeTriggerState {
	readonly identity?: DispatchTriggerIdentityResult;
	readonly startResult?: DispatchStartRunResult;
	readonly runId?: string;
}

export class FakeDispatchTriggerGateway implements DispatchTriggerGateway {
	private readonly identityCallLog: DispatchTriggerConnection[] = [];
	private readonly startCallLog: Array<{
		connection: DispatchTriggerConnection;
		input: DispatchRunInput;
	}> = [];
	private readonly state: FakeTriggerState;
	private readonly recordOperation: (operation: string) => void;

	constructor(state: FakeTriggerState = {}, recordOperation = (_operation: string) => {}) {
		this.state = state;
		this.recordOperation = recordOperation;
	}

	get identityCalls(): readonly DispatchTriggerConnection[] {
		return this.identityCallLog.map((entry) => ({ ...entry }));
	}

	get startCalls(): ReadonlyArray<{
		readonly connection: DispatchTriggerConnection;
		readonly input: DispatchRunInput;
	}> {
		return this.startCallLog.map((entry) => ({
			connection: { ...entry.connection },
			input: { ...entry.input },
		}));
	}

	async checkTriggerIdentity(options: { readonly connection: DispatchTriggerConnection }) {
		this.identityCallLog.push({ ...options.connection });
		this.recordOperation("trigger:check-identity");
		return this.state.identity ?? { type: "authorized" as const };
	}

	async startDispatchRun(options: {
		readonly connection: DispatchTriggerConnection;
		readonly input: DispatchRunInput;
	}) {
		this.startCallLog.push({ connection: { ...options.connection }, input: { ...options.input } });
		this.recordOperation("trigger:start-run");
		return (
			this.state.startResult ?? {
				ok: true as const,
				value: { runId: this.state.runId ?? FAKE_RUN_ID },
			}
		);
	}
}

export class FakeDispatchLocalTokenGateway implements DispatchLocalTokenGateway {
	private readonly readLog: string[] = [];
	private readonly result: DispatchLocalTokenResult;
	private readonly recordOperation: (operation: string) => void;

	constructor(
		result: DispatchLocalTokenResult = { type: "found", token: FAKE_OIDC_TOKEN },
		recordOperation = (_operation: string) => {},
	) {
		this.result = result;
		this.recordOperation = recordOperation;
	}

	get reads(): readonly string[] {
		return [...this.readLog];
	}

	async readDevelopmentOidcToken() {
		this.readLog.push("development-oidc-token");
		this.recordOperation("token:read-development-oidc");
		return this.result;
	}
}

export interface FakeDispatchConfigState {
	readonly dispatchSettings?: DispatchConfigSourceResult;
	readonly packageManager?: DispatchConfigSourceResult;
	readonly dispatchSettingsAfterPublication?: DispatchConfigSourceResult;
	readonly packageManagerAfterPublication?: DispatchConfigSourceResult;
	readonly dispatchSettingsBeforeFinalValidation?: DispatchConfigSourceResult;
	readonly packageManagerBeforeFinalValidation?: DispatchConfigSourceResult;
}

export class FakeDispatchConfigGateway implements DispatchConfigGateway {
	private readonly readLog: Array<{
		source: "dispatch-settings" | "package-manager";
		repoRoot: string;
	}> = [];
	private readonly repository: FakeDispatchRepositoryState;
	private readonly state: FakeDispatchConfigState;
	private readonly recordOperation: (operation: string) => void;

	constructor(
		repository: FakeDispatchRepositoryState,
		state: FakeDispatchConfigState = {},
		recordOperation = (_operation: string) => {},
	) {
		this.repository = repository;
		this.state = state;
		this.recordOperation = recordOperation;
	}

	get reads(): ReadonlyArray<{
		readonly source: "dispatch-settings" | "package-manager";
		readonly repoRoot: string;
	}> {
		return this.readLog.map((entry) => ({ ...entry }));
	}

	async readDispatchSettingsSource(options: { readonly repoRoot: string }) {
		this.readLog.push({ source: "dispatch-settings", repoRoot: options.repoRoot });
		this.recordOperation("config:read-dispatch-settings");
		const beforeFinalValidation = this.repository.isFinalValidationReady;
		const afterPublication = this.repository.hasSourcePublication;
		return (
			(beforeFinalValidation ? this.state.dispatchSettingsBeforeFinalValidation : undefined) ??
			(afterPublication ? this.state.dispatchSettingsAfterPublication : undefined) ??
			this.state.dispatchSettings ?? { type: "found", source: FAKE_DISPATCH_SETTINGS_SOURCE }
		);
	}

	async readPackageManagerSource(options: { readonly repoRoot: string }) {
		this.readLog.push({ source: "package-manager", repoRoot: options.repoRoot });
		this.recordOperation("config:read-package-manager");
		const beforeFinalValidation = this.repository.isFinalValidationReady;
		const afterPublication = this.repository.hasSourcePublication;
		return (
			(beforeFinalValidation ? this.state.packageManagerBeforeFinalValidation : undefined) ??
			(afterPublication ? this.state.packageManagerAfterPublication : undefined) ??
			this.state.packageManager ?? { type: "found", source: FAKE_PACKAGE_MANAGER_SOURCE }
		);
	}
}

class FakeDispatchSavedPlanGateway implements DispatchSavedPlanGateway {
	private readonly result: DispatchSavedPlanResolution;

	constructor(
		result: DispatchSavedPlanResolution = {
			type: "resolved",
			plan: {
				filePath: FAKE_PLAN_REF,
				slug: "add-cache",
				sourceBranch: "feature/widgets",
				content: "# Add cache\n",
			},
		},
	) {
		this.result = result;
	}

	async resolveExplicitSavedPlan(): Promise<DispatchSavedPlanResolution> {
		return this.result;
	}
}

export class FakeDispatchContentSlugGateway implements DispatchContentSlugGateway {
	private readonly callLog: DispatchContentSlugInput[] = [];
	private readonly result: DispatchContentSlugResult;
	private readonly recordOperation: (operation: string) => void;

	constructor(
		result: DispatchContentSlugResult = { ok: true, slug: FAKE_SEMANTIC_SLUG },
		recordOperation = (_operation: string) => {},
	) {
		this.result = result;
		this.recordOperation = recordOperation;
	}

	get calls(): readonly DispatchContentSlugInput[] {
		return this.callLog.map((entry) => ({ ...entry }));
	}

	async deriveSemanticSlug(input: DispatchContentSlugInput) {
		this.callLog.push({ ...input });
		this.recordOperation("slug:derive-semantic");
		return this.result;
	}
}

class FakeDispatchPlanBrmemGateway extends FakeBrmemGateway {
	override async createEntry(options: {
		readonly namespace: string;
		readonly key: string;
		readonly branch: string;
		readonly content: string;
	}): Promise<BrmemResult<PutEntryResult>> {
		return {
			type: "ok",
			value: {
				commitSha: FAKE_PLAN_SNAPSHOT_COMMIT,
				entry: {
					namespace: options.namespace,
					key: options.key,
					branch: options.branch,
					entryLocator: `${options.namespace}:${options.key}`,
				},
			},
		};
	}
}

class FakeDispatchPlanSnapshotGateway implements DispatchPlanSnapshotGateway {
	private commitSha = FAKE_PLAN_SNAPSHOT_COMMIT;
	private readonly publishResult: FakeDispatchPlanState["snapshotPublishResult"];
	private readonly remoteResult: FakeDispatchPlanState["remoteSnapshotResult"];

	constructor(state: FakeDispatchPlanState = {}) {
		this.publishResult = state.snapshotPublishResult;
		this.remoteResult = state.remoteSnapshotResult;
	}

	async publishSnapshot(options: { readonly commitSha: string }) {
		this.commitSha = options.commitSha;
		return this.publishResult ?? ({ ok: true } as const);
	}

	async readRemoteSnapshotTip() {
		return this.remoteResult ?? ({ type: "found", commitSha: this.commitSha } as const);
	}
}

export interface FakeDispatchPlanState {
	readonly savedPlan?: DispatchSavedPlanResolution;
	readonly brmem?: ConstructorParameters<typeof FakeBrmemGateway>[0];
	readonly snapshotPublishResult?: Awaited<
		ReturnType<DispatchPlanSnapshotGateway["publishSnapshot"]>
	>;
	readonly remoteSnapshotResult?: Awaited<
		ReturnType<DispatchPlanSnapshotGateway["readRemoteSnapshotTip"]>
	>;
}

export class FakeDispatchClock implements Clock {
	private readonly readLog: number[] = [];
	private readonly now: number;

	constructor(now = FAKE_NOW_MS) {
		this.now = now;
	}

	get reads(): readonly number[] {
		return [...this.readLog];
	}

	nowMs(): number {
		this.readLog.push(this.now);
		return this.now;
	}
}

export interface FakeDispatchGatewaysOptions {
	readonly git?: FakeWorkspaceGitState;
	readonly sourcePublication?: FakeSourcePublicationState;
	readonly publicationAuthorization?: FakePublicationAuthorizationState;
	readonly anchorPrs?: FakeAnchorPrState;
	readonly trigger?: FakeTriggerState;
	readonly token?: DispatchLocalTokenResult;
	readonly config?: FakeDispatchConfigState;
	readonly plan?: FakeDispatchPlanState;
	readonly semanticSlug?: DispatchContentSlugResult;
	readonly clockNowMs?: number;
}

export interface FakeDispatchGatewayBundle extends DispatchPromptGateways {
	readonly operations: readonly string[];
	readonly git: FakeDispatchWorkspaceGitGateway;
	readonly sourcePublication: FakeDispatchSourcePublicationGateway;
	readonly publicationAuthorization: FakeDispatchPublicationAuthorizationGateway;
	readonly anchorPrs: FakeDispatchAnchorPrGateway;
	readonly trigger: FakeDispatchTriggerGateway;
	readonly config: FakeDispatchConfigGateway;
	readonly semanticSlugs: FakeDispatchContentSlugGateway;
	readonly clock: FakeDispatchClock;
}

export function createFakeDispatchGateways(
	options: FakeDispatchGatewaysOptions = {},
): FakeDispatchGatewayBundle {
	const operations: string[] = [];
	const recordOperation = (operation: string) => operations.push(operation);
	const repository = new FakeDispatchRepositoryState(options.git ?? {});
	return {
		get operations() {
			return [...operations];
		},
		git: new FakeDispatchWorkspaceGitGateway(repository, options.git, recordOperation),
		sourcePublication: new FakeDispatchSourcePublicationGateway(
			repository,
			options.sourcePublication,
			recordOperation,
		),
		publicationAuthorization: new FakeDispatchPublicationAuthorizationGateway(
			options.publicationAuthorization,
			recordOperation,
		),
		anchorPrs: new FakeDispatchAnchorPrGateway(options.anchorPrs, recordOperation),
		trigger: new FakeDispatchTriggerGateway(options.trigger, recordOperation),
		tokens: new FakeDispatchLocalTokenGateway(options.token, recordOperation),
		config: new FakeDispatchConfigGateway(repository, options.config, recordOperation),
		semanticSlugs: new FakeDispatchContentSlugGateway(options.semanticSlug, recordOperation),
		clock: new FakeDispatchClock(options.clockNowMs),
	};
}

export function createFakePlanDispatchGateways(
	options: FakeDispatchGatewaysOptions = {},
): DispatchPlanGateways & FakeDispatchGatewayBundle {
	const shared = createFakeDispatchGateways(options);
	return {
		...shared,
		get operations() {
			return shared.operations;
		},
		savedPlans: new FakeDispatchSavedPlanGateway(options.plan?.savedPlan),
		brmem: new FakeDispatchPlanBrmemGateway(
			options.plan?.brmem ?? {
				remotes: {
					origin: {
						push: ["refs/brmem/*:refs/brmem/*"],
						fetch: ["refs/brmem/*:refs/brmem/*"],
					},
				},
			},
		),
		snapshots: new FakeDispatchPlanSnapshotGateway(options.plan),
		generateDispatchId: () => FAKE_DISPATCH_ID,
	};
}

/** Minimal NsExtensionApi fake for dispatch command scenario tests. */
export class FakeDispatchNsApi implements NsExtensionApi {
	readonly cwd: string;
	readonly env: Record<string, string | undefined> = {};
	readonly extensions: NsExtensionApi["extensions"];
	readonly stdoutChunks: string[] = [];
	readonly stderrChunks: string[] = [];
	readonly progress = noopNsProgress;
	readonly phaseLabels: string[] = [];
	readonly renderCapabilities = { canEmitAnsi: false };
	readonly hasExtension = () => false;
	readonly commandIo: NsCommandIo = {
		phase: (message) => this.phaseLabels.push(message),
		notify: () => {},
		message: () => {},
		clearPhase: () => this.phaseLabels.push("cleared"),
	};
	readonly stdout = (text: string) => this.stdoutChunks.push(text);
	readonly stderr = (text: string) => this.stderrChunks.push(text);

	constructor(options: { cwd?: string } | DispatchPromptGateways = {}) {
		this.cwd = "cwd" in options && typeof options.cwd === "string" ? options.cwd : "/repo";
		this.extensions = "git" in options ? { dispatch: options } : undefined;
	}

	async exec(): Promise<ExecResult> {
		throw new Error("Unexpected ctx.exec call in a dispatch command scenario test.");
	}

	readonly textGenerator = {
		generateText: async (_request: TextGenerationRequest): Promise<TextGenerationResult> => {
			throw new Error("Unexpected text-generation call in a dispatch command scenario test.");
		},
	};
}

function copySourcePatch(patch: FakeSourcePatch): FakeSourcePatch {
	return {
		...patch,
		...(patch.dirtyPaths === undefined ? {} : { dirtyPaths: [...patch.dirtyPaths] }),
		...(patch.dirtyReadError === undefined ? {} : { dirtyReadError: { ...patch.dirtyReadError } }),
		...(patch.remoteTip === undefined ? {} : { remoteTip: copyRemoteTip(patch.remoteTip) }),
	};
}

function copyRemoteTip(result: DispatchRemoteBranchTipResult): DispatchRemoteBranchTipResult {
	return result.type === "error" ? { type: "error", error: { ...result.error } } : { ...result };
}
