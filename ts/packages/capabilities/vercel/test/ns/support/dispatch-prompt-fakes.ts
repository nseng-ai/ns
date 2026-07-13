// Constructor-state in-memory fakes for the `ns dispatch prompt` gateway
// seams, plus a minimal NsExtensionApi fake that publishes them through
// `ctx.extensions.dispatch` (the objectives override-channel pattern).
import { noopNsProgress } from "@nseng-ai/sdk";
import type {
	ExecResult,
	NsCommandIo,
	NsExtensionApi,
	TextGenerationRequest,
	TextGenerationResult,
} from "@nseng-ai/sdk";

import type {
	DispatchAnchorPrGateway,
	DispatchConfigGateway,
	DispatchGitOperationResult,
	DispatchLocalTokenGateway,
	DispatchLocalTokenResult,
	DispatchPromptGateways,
	DispatchRemoteBranchTipResult,
	DispatchStartRunResult,
	DispatchTriggerGateway,
	DispatchTriggerIdentityResult,
	DispatchWorkspaceGitGateway,
} from "../../../src/ns/dispatch-prompt/contracts.ts";
import type { DispatchRunInput } from "../../../src/dispatch/dispatch-run.ts";

export const FAKE_HEAD_SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
export const FAKE_ANCHOR_ID = "ab12cd34";
export const FAKE_RUN_ID = "wf_run_0123456789";
export const FAKE_DEPLOYMENT_URL = "https://ns-dispatch.example.vercel.app";
export const FAKE_OIDC_TOKEN = "fake-development-oidc-token";

export const FAKE_DISPATCH_SETTINGS_SOURCE = [
	"[dispatch]",
	'harness = "pi"',
	'vercel_project_id = "prj_Fake123"',
	'vercel_team_id = "team_Fake123"',
	`deployment_url = "${FAKE_DEPLOYMENT_URL}"`,
	"",
].join("\n");

export interface FakeWorkspaceGitState {
	readonly repoRoot?: string;
	readonly branch?: string;
	readonly headSha?: string;
	readonly detachedHead?: boolean;
	readonly notARepository?: boolean;
	readonly dirtyPaths?: readonly string[];
	/** Remote tip for the source branch; defaults to fresh (same as head). */
	readonly remoteTip?: DispatchRemoteBranchTipResult;
	readonly sourcePushResult?: DispatchGitOperationResult;
	readonly anchorPushResult?: DispatchGitOperationResult;
}

export class FakeDispatchWorkspaceGitGateway implements DispatchWorkspaceGitGateway {
	readonly sourcePushes: string[] = [];
	readonly anchorPushes: { revision: string; anchorBranch: string }[] = [];
	private readonly state: FakeWorkspaceGitState;

	constructor(state: FakeWorkspaceGitState = {}) {
		this.state = { ...state, dirtyPaths: [...(state.dirtyPaths ?? [])] };
	}

	private headSha(): string {
		return this.state.headSha ?? FAKE_HEAD_SHA;
	}

	async resolveSourceRef(): ReturnType<DispatchWorkspaceGitGateway["resolveSourceRef"]> {
		if (this.state.notARepository === true) {
			return {
				ok: false,
				error: { code: "not-a-repository", message: "Not inside a git repository." },
			};
		}
		if (this.state.detachedHead === true) {
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

	async listDirtyPaths(): ReturnType<DispatchWorkspaceGitGateway["listDirtyPaths"]> {
		return { ok: true, value: [...(this.state.dirtyPaths ?? [])] };
	}

	async readRemoteBranchTip(): Promise<DispatchRemoteBranchTipResult> {
		return this.state.remoteTip ?? { type: "found", sha: this.headSha() };
	}

	async pushSourceBranch(options: {
		readonly cwd: string;
		readonly branch: string;
	}): Promise<DispatchGitOperationResult> {
		const result = this.state.sourcePushResult ?? { ok: true };
		if (result.ok) this.sourcePushes.push(options.branch);
		return result;
	}

	async pushAnchorBranch(options: {
		readonly cwd: string;
		readonly revision: string;
		readonly anchorBranch: string;
	}): Promise<DispatchGitOperationResult> {
		const result = this.state.anchorPushResult ?? { ok: true };
		if (result.ok) {
			this.anchorPushes.push({ revision: options.revision, anchorBranch: options.anchorBranch });
		}
		return result;
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

	constructor(state: FakeAnchorPrState = {}) {
		this.state = state;
	}

	async openAnchorPr(options: {
		readonly cwd: string;
		readonly anchorBranch: string;
		readonly baseBranch: string;
		readonly title: string;
		readonly body: string;
	}): ReturnType<DispatchAnchorPrGateway["openAnchorPr"]> {
		if (this.state.openResult !== undefined) return this.state.openResult;
		const number = this.state.prNumber ?? 41;
		this.opened.push({
			anchorBranch: options.anchorBranch,
			baseBranch: options.baseBranch,
			title: options.title,
			body: options.body,
		});
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
		const result = this.state.stampResult ?? { ok: true };
		if (result.ok) this.stamps.push({ prNumber: options.prNumber, runId: options.runId });
		return result;
	}
}

export interface FakeTriggerState {
	readonly identity?: DispatchTriggerIdentityResult;
	readonly startResult?: DispatchStartRunResult;
}

export class FakeDispatchTriggerGateway implements DispatchTriggerGateway {
	readonly identityCalls: { deploymentUrl: string; oidcToken: string }[] = [];
	readonly startCalls: { deploymentUrl: string; oidcToken: string; input: DispatchRunInput }[] = [];
	private readonly state: FakeTriggerState;

	constructor(state: FakeTriggerState = {}) {
		this.state = state;
	}

	async checkTriggerIdentity(options: {
		readonly deploymentUrl: string;
		readonly oidcToken: string;
	}): Promise<DispatchTriggerIdentityResult> {
		this.identityCalls.push({ ...options });
		return this.state.identity ?? { type: "authorized" };
	}

	async startDispatchRun(options: {
		readonly deploymentUrl: string;
		readonly oidcToken: string;
		readonly input: DispatchRunInput;
	}): Promise<DispatchStartRunResult> {
		this.startCalls.push({
			deploymentUrl: options.deploymentUrl,
			oidcToken: options.oidcToken,
			input: { ...options.input },
		});
		return this.state.startResult ?? { ok: true, value: { runId: FAKE_RUN_ID } };
	}
}

export class FakeDispatchLocalTokenGateway implements DispatchLocalTokenGateway {
	private readonly result: DispatchLocalTokenResult;

	constructor(result: DispatchLocalTokenResult = { type: "found", token: FAKE_OIDC_TOKEN }) {
		this.result = result;
	}

	async readDevelopmentOidcToken(): Promise<DispatchLocalTokenResult> {
		return this.result;
	}
}

export class FakeDispatchConfigGateway implements DispatchConfigGateway {
	private readonly source: string | null;

	constructor(source: string | null = FAKE_DISPATCH_SETTINGS_SOURCE) {
		this.source = source;
	}

	async readDispatchSettingsSource(): ReturnType<
		DispatchConfigGateway["readDispatchSettingsSource"]
	> {
		if (this.source === null) return { type: "missing" };
		return { type: "found", source: this.source };
	}
}

export interface FakeDispatchGatewaysOptions {
	readonly git?: FakeWorkspaceGitState;
	readonly anchorPrs?: FakeAnchorPrState;
	readonly trigger?: FakeTriggerState;
	readonly token?: DispatchLocalTokenResult;
	readonly configSource?: string | null;
}

export interface FakeDispatchGatewayBundle extends DispatchPromptGateways {
	readonly git: FakeDispatchWorkspaceGitGateway;
	readonly anchorPrs: FakeDispatchAnchorPrGateway;
	readonly trigger: FakeDispatchTriggerGateway;
}

export function createFakeDispatchGateways(
	options: FakeDispatchGatewaysOptions = {},
): FakeDispatchGatewayBundle {
	return {
		git: new FakeDispatchWorkspaceGitGateway(options.git),
		anchorPrs: new FakeDispatchAnchorPrGateway(options.anchorPrs),
		trigger: new FakeDispatchTriggerGateway(options.trigger),
		tokens: new FakeDispatchLocalTokenGateway(options.token),
		config: new FakeDispatchConfigGateway(
			options.configSource === undefined ? FAKE_DISPATCH_SETTINGS_SOURCE : options.configSource,
		),
		generateAnchorId: () => FAKE_ANCHOR_ID,
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
	readonly renderCapabilities = { canEmitAnsi: false };
	readonly hasExtension = () => false;
	readonly commandIo: NsCommandIo = {
		phase: () => {},
		notify: () => {},
		message: () => {},
		clearPhase: () => {},
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
