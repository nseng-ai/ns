// Constructor-state in-memory fakes for the `ns dispatch prompt` gateway
// seams, plus a minimal NsExtensionApi fake that publishes them through
// `ctx.extensions.dispatch` (the objectives override-channel pattern).
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
	DispatchContentSlugGateway,
	DispatchContentSlugInput,
	DispatchContentSlugResult,
	DispatchConfigSourceResult,
	DispatchGitOperationResult,
	DispatchLocalTokenGateway,
	DispatchLocalTokenResult,
	DispatchPromptGateways,
	DispatchRemoteBranchTipResult,
	DispatchStartRunResult,
	DispatchTriggerConnection,
	DispatchTriggerGateway,
	DispatchTriggerIdentityResult,
	DispatchWorkspaceGitGateway,
} from "../../../src/ns/dispatch-prompt/contracts.ts";
import type { DispatchRunInput } from "../../../src/dispatch/dispatch-run.ts";

export const FAKE_HEAD_SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
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

export const FAKE_PACKAGE_MANAGER_SOURCE = JSON.stringify({
	packageManager: "pnpm@11.8.1",
});

export interface FakeWorkspaceGitState {
	readonly repoRoot?: string;
	readonly branch?: string;
	readonly headSha?: string;
	readonly isDetachedHead?: boolean;
	readonly isNotARepository?: boolean;
	readonly dirtyPaths?: readonly string[];
	/** Remote tip for the source branch; defaults to fresh (same as head). */
	readonly remoteTip?: DispatchRemoteBranchTipResult;
	readonly occupiedAnchorBranches?: readonly string[];
	readonly anchorAvailabilityError?: DispatchAnchorBranchAvailabilityResult;
	readonly sourcePushResult?: DispatchGitOperationResult;
	readonly anchorPushResult?: DispatchGitOperationResult;
}

export class FakeDispatchWorkspaceGitGateway implements DispatchWorkspaceGitGateway {
	readonly sourceRefReads: string[] = [];
	readonly dirtyPathReads: string[] = [];
	readonly remoteTipReads: Array<{ cwd: string; branch: string }> = [];
	readonly anchorAvailabilityReads: Array<{ cwd: string; anchorBranch: string }> = [];
	readonly sourcePushes: string[] = [];
	readonly anchorPushes: { revision: string; anchorBranch: string }[] = [];
	private readonly state: FakeWorkspaceGitState;
	private readonly recordOperation: (operation: string) => void;

	constructor(state: FakeWorkspaceGitState = {}, recordOperation = (_operation: string) => {}) {
		this.state = {
			...state,
			dirtyPaths: [...(state.dirtyPaths ?? [])],
			occupiedAnchorBranches: [...(state.occupiedAnchorBranches ?? [])],
		};
		this.recordOperation = recordOperation;
	}

	private headSha(): string {
		return this.state.headSha ?? FAKE_HEAD_SHA;
	}

	async resolveSourceRef(options: {
		readonly cwd: string;
	}): ReturnType<DispatchWorkspaceGitGateway["resolveSourceRef"]> {
		this.sourceRefReads.push(options.cwd);
		this.recordOperation("git:resolve-source-ref");
		if (this.state.isNotARepository === true) {
			return {
				ok: false,
				error: { code: "not-a-repository", message: "Not inside a git repository." },
			};
		}
		if (this.state.isDetachedHead === true) {
			return {
				ok: false,
				error: { code: "detached-head", message: "HEAD is detached; check out a branch first." },
			};
		}
		return {
			ok: true,
			value: {
				repoRoot: this.state.repoRoot ?? "/repo",
				branch: this.state.branch ?? "feature/widgets",
				headSha: this.headSha(),
			},
		};
	}

	async listDirtyPaths(options: {
		readonly cwd: string;
	}): ReturnType<DispatchWorkspaceGitGateway["listDirtyPaths"]> {
		this.dirtyPathReads.push(options.cwd);
		this.recordOperation("git:list-dirty-paths");
		return { ok: true, value: [...(this.state.dirtyPaths ?? [])] };
	}

	async readRemoteBranchTip(options: {
		readonly cwd: string;
		readonly branch: string;
	}): Promise<DispatchRemoteBranchTipResult> {
		this.remoteTipReads.push({ ...options });
		this.recordOperation("git:read-remote-tip");
		return this.state.remoteTip ?? { type: "found", sha: this.headSha() };
	}

	async isAnchorBranchNameAvailable(options: {
		readonly cwd: string;
		readonly anchorBranch: string;
	}): Promise<DispatchAnchorBranchAvailabilityResult> {
		this.anchorAvailabilityReads.push({ ...options });
		this.recordOperation("git:check-anchor-availability");
		if (this.state.anchorAvailabilityError !== undefined) {
			return this.state.anchorAvailabilityError;
		}
		return this.state.occupiedAnchorBranches?.includes(options.anchorBranch) === true
			? { type: "occupied" }
			: { type: "available" };
	}

	async pushSourceBranch(options: {
		readonly cwd: string;
		readonly branch: string;
	}): Promise<DispatchGitOperationResult> {
		this.sourcePushes.push(options.branch);
		this.recordOperation("git:push-source");
		return this.state.sourcePushResult ?? { ok: true };
	}

	async pushAnchorBranch(options: {
		readonly cwd: string;
		readonly revision: string;
		readonly anchorBranch: string;
	}): Promise<DispatchGitOperationResult> {
		this.anchorPushes.push({ revision: options.revision, anchorBranch: options.anchorBranch });
		this.recordOperation("git:push-anchor");
		return this.state.anchorPushResult ?? { ok: true };
	}
}

export interface FakeAnchorPrState {
	readonly prNumber?: number;
	readonly prUrl?: string;
	readonly openResult?: { readonly ok: false; readonly error: { code: string; message: string } };
	readonly stampResult?: DispatchGitOperationResult;
}

export class FakeDispatchAnchorPrGateway implements DispatchAnchorPrGateway {
	readonly opened: {
		anchorBranch: string;
		baseBranch: string;
		title: string;
		body: string;
	}[] = [];
	readonly stamps: { prNumber: number; runId: string }[] = [];
	private readonly state: FakeAnchorPrState;
	private readonly recordOperation: (operation: string) => void;

	constructor(state: FakeAnchorPrState = {}, recordOperation = (_operation: string) => {}) {
		this.state = state;
		this.recordOperation = recordOperation;
	}

	async openAnchorPr(options: {
		readonly cwd: string;
		readonly anchorBranch: string;
		readonly baseBranch: string;
		readonly title: string;
		readonly body: string;
	}): ReturnType<DispatchAnchorPrGateway["openAnchorPr"]> {
		this.opened.push({
			anchorBranch: options.anchorBranch,
			baseBranch: options.baseBranch,
			title: options.title,
			body: options.body,
		});
		this.recordOperation("anchor-pr:open");
		if (this.state.openResult !== undefined) return this.state.openResult;
		const number = this.state.prNumber ?? 41;
		return {
			ok: true,
			value: {
				number,
				url: this.state.prUrl ?? `https://github.com/nseng-ai/ns/pull/${number}`,
			},
		};
	}

	async stampAnchorPrRunId(options: {
		readonly cwd: string;
		readonly prNumber: number;
		readonly runId: string;
	}): Promise<DispatchGitOperationResult> {
		this.stamps.push({ prNumber: options.prNumber, runId: options.runId });
		this.recordOperation("anchor-pr:stamp-run-id");
		return this.state.stampResult ?? { ok: true };
	}
}

export interface FakeTriggerState {
	readonly identity?: DispatchTriggerIdentityResult;
	readonly startResult?: DispatchStartRunResult;
}

export class FakeDispatchTriggerGateway implements DispatchTriggerGateway {
	readonly identityCalls: DispatchTriggerConnection[] = [];
	readonly startCalls: { connection: DispatchTriggerConnection; input: DispatchRunInput }[] = [];
	private readonly state: FakeTriggerState;
	private readonly recordOperation: (operation: string) => void;

	constructor(state: FakeTriggerState = {}, recordOperation = (_operation: string) => {}) {
		this.state = state;
		this.recordOperation = recordOperation;
	}

	async checkTriggerIdentity(options: {
		readonly connection: DispatchTriggerConnection;
	}): Promise<DispatchTriggerIdentityResult> {
		this.identityCalls.push({ ...options.connection });
		this.recordOperation("trigger:check-identity");
		return this.state.identity ?? { type: "authorized" };
	}

	async startDispatchRun(options: {
		readonly connection: DispatchTriggerConnection;
		readonly input: DispatchRunInput;
	}): Promise<DispatchStartRunResult> {
		this.startCalls.push({
			connection: { ...options.connection },
			input: { ...options.input },
		});
		this.recordOperation("trigger:start-run");
		return this.state.startResult ?? { ok: true, value: { runId: FAKE_RUN_ID } };
	}
}

export class FakeDispatchLocalTokenGateway implements DispatchLocalTokenGateway {
	readonly reads: string[] = [];
	private readonly result: DispatchLocalTokenResult;
	private readonly recordOperation: (operation: string) => void;

	constructor(
		result: DispatchLocalTokenResult = { type: "found", token: FAKE_OIDC_TOKEN },
		recordOperation = (_operation: string) => {},
	) {
		this.result = result;
		this.recordOperation = recordOperation;
	}

	async readDevelopmentOidcToken(): Promise<DispatchLocalTokenResult> {
		this.reads.push("development-oidc-token");
		this.recordOperation("token:read-development-oidc");
		return this.result;
	}
}

export interface FakeDispatchConfigState {
	readonly dispatchSettings?: DispatchConfigSourceResult;
	readonly packageManager?: DispatchConfigSourceResult;
}

export class FakeDispatchConfigGateway implements DispatchConfigGateway {
	readonly reads: Array<{
		source: "dispatch-settings" | "package-manager";
		repoRoot: string;
	}> = [];
	private readonly dispatchSettings: DispatchConfigSourceResult;
	private readonly packageManager: DispatchConfigSourceResult;
	private readonly recordOperation: (operation: string) => void;

	constructor(state: FakeDispatchConfigState = {}, recordOperation = (_operation: string) => {}) {
		this.dispatchSettings = state.dispatchSettings ?? {
			type: "found",
			source: FAKE_DISPATCH_SETTINGS_SOURCE,
		};
		this.packageManager = state.packageManager ?? {
			type: "found",
			source: FAKE_PACKAGE_MANAGER_SOURCE,
		};
		this.recordOperation = recordOperation;
	}

	async readDispatchSettingsSource(options: {
		readonly repoRoot: string;
	}): ReturnType<DispatchConfigGateway["readDispatchSettingsSource"]> {
		this.reads.push({ source: "dispatch-settings", repoRoot: options.repoRoot });
		this.recordOperation("config:read-dispatch-settings");
		return this.dispatchSettings;
	}

	async readPackageManagerSource(options: {
		readonly repoRoot: string;
	}): ReturnType<DispatchConfigGateway["readPackageManagerSource"]> {
		this.reads.push({ source: "package-manager", repoRoot: options.repoRoot });
		this.recordOperation("config:read-package-manager");
		return this.packageManager;
	}
}

export class FakeDispatchContentSlugGateway implements DispatchContentSlugGateway {
	readonly calls: DispatchContentSlugInput[] = [];
	private readonly result: DispatchContentSlugResult;
	private readonly recordOperation: (operation: string) => void;

	constructor(
		result: DispatchContentSlugResult = { ok: true, slug: FAKE_SEMANTIC_SLUG },
		recordOperation = (_operation: string) => {},
	) {
		this.result = result;
		this.recordOperation = recordOperation;
	}

	async deriveSemanticSlug(input: DispatchContentSlugInput): Promise<DispatchContentSlugResult> {
		this.calls.push({ ...input });
		this.recordOperation("slug:derive-semantic");
		return this.result;
	}
}

export class FakeDispatchClock implements Clock {
	readonly reads: number[] = [];
	private readonly now: number;

	constructor(now = FAKE_NOW_MS) {
		this.now = now;
	}

	nowMs(): number {
		this.reads.push(this.now);
		return this.now;
	}
}

export interface FakeDispatchGatewaysOptions {
	readonly git?: FakeWorkspaceGitState;
	readonly anchorPrs?: FakeAnchorPrState;
	readonly trigger?: FakeTriggerState;
	readonly token?: DispatchLocalTokenResult;
	readonly config?: FakeDispatchConfigState;
	readonly semanticSlug?: DispatchContentSlugResult;
	readonly clockNowMs?: number;
}

export interface FakeDispatchGatewayBundle extends DispatchPromptGateways {
	readonly operations: readonly string[];
	readonly git: FakeDispatchWorkspaceGitGateway;
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
	return {
		operations,
		git: new FakeDispatchWorkspaceGitGateway(options.git, recordOperation),
		anchorPrs: new FakeDispatchAnchorPrGateway(options.anchorPrs, recordOperation),
		trigger: new FakeDispatchTriggerGateway(options.trigger, recordOperation),
		tokens: new FakeDispatchLocalTokenGateway(options.token, recordOperation),
		config: new FakeDispatchConfigGateway(options.config, recordOperation),
		semanticSlugs: new FakeDispatchContentSlugGateway(options.semanticSlug, recordOperation),
		clock: new FakeDispatchClock(options.clockNowMs),
	};
}

/**
 * Minimal NsExtensionApi fake for dispatch command scenario tests: all
 * external I/O rides the injected gateway fakes, so `exec` throws to
 * catch any accidental real-adapter use.
 */
export class FakeDispatchNsApi implements NsExtensionApi {
	readonly cwd: string;
	readonly env: Record<string, string | undefined> = {};
	readonly extensions: Readonly<Record<string, unknown>>;
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
	readonly stdout = (text: string) => {
		this.stdoutChunks.push(text);
	};
	readonly stderr = (text: string) => {
		this.stderrChunks.push(text);
	};

	constructor(gateways: DispatchPromptGateways, options: { cwd?: string } = {}) {
		this.cwd = options.cwd ?? "/repo";
		this.extensions = { dispatch: gateways };
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
