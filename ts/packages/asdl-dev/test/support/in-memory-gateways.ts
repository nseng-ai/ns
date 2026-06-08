import type { CheckpointGateway } from "asdl-dev/src/checkpoint.ts";
import type { AsdlDevContext } from "asdl-dev/src/context.ts";
import type { GitGateway } from "asdl-dev/src/gateways/git.ts";
import type { ProjectConfigReadResult, VercelProjectConfigStore } from "asdl-dev/src/gateways/project-config.ts";
import type { DeploymentCandidate, InspectedDeployment, VercelDeploymentGateway } from "asdl-dev/src/gateways/vercel.ts";
import type { PendingWorktreeError, PendingWorktreeSnapshot, WorktreeCommandResult } from "asdl-dev/src/pending-worktree.ts";
import { err, ok, type ErrorInfo, type GatewayResult } from "asdl-dev/src/result.ts";
import type {
	CurrentPrVerificationResult,
	SubmitCommandOutput,
	SubmitCommandParams,
	SubmitGateway,
	SubmitPreflightResult,
	SubmitRestackResult,
	SubmitRunResult,
} from "asdl-dev/src/submit.ts";
import type { TextGenerationGateway, TextGenerationRequest, TextGenerationResult } from "asdl-dev/src/text-generation.ts";

export type FakeCurrentBranchState = string | { kind: "detached" } | { kind: "failure"; error?: ErrorInfo };
export type FakeRepoRootState = string | { kind: "failure"; error?: ErrorInfo };

export interface InMemoryGitGatewayState {
	currentBranch?: FakeCurrentBranchState;
	repoRoot?: FakeRepoRootState;
}

export interface GitCall {
	cwd: string;
}

export class InMemoryGitGateway implements GitGateway {
	private readonly currentBranchState: FakeCurrentBranchState;
	private readonly repoRootState: FakeRepoRootState;
	private readonly currentBranchLog: GitCall[] = [];
	private readonly repoRootLog: GitCall[] = [];

	constructor(state: InMemoryGitGatewayState = {}) {
		this.currentBranchState = state.currentBranch ?? "feature/demo";
		this.repoRootState = state.repoRoot ?? "/repo";
	}

	get currentBranchCalls(): readonly GitCall[] {
		return this.currentBranchLog.map((call) => ({ ...call }));
	}

	get repoRootCalls(): readonly GitCall[] {
		return this.repoRootLog.map((call) => ({ ...call }));
	}

	async currentBranch(params: { cwd: string }): Promise<GatewayResult<string>> {
		this.currentBranchLog.push({ cwd: params.cwd });
		if (typeof this.currentBranchState === "string") {
			const branch = nonBlank(this.currentBranchState);
			if (branch === undefined) {
				return err(detachedHeadError());
			}
			return ok(branch);
		}

		if (this.currentBranchState.kind === "detached") {
			return err(detachedHeadError());
		}

		return err(this.currentBranchState.error ?? { code: "branch_unresolved", message: "Could not resolve the current git branch." });
	}

	async repoRoot(params: { cwd: string }): Promise<GatewayResult<string>> {
		this.repoRootLog.push({ cwd: params.cwd });
		if (typeof this.repoRootState === "string") {
			const repoRoot = nonBlank(this.repoRootState);
			if (repoRoot === undefined) {
				return err({ code: "repo_root_unresolved", message: "Git repository root command returned no path." });
			}
			return ok(repoRoot);
		}

		return err(this.repoRootState.error ?? { code: "repo_root_unresolved", message: "Could not resolve the git repository root." });
	}
}

export type FakePendingWorktreeSnapshotState =
	| PendingWorktreeSnapshot
	| {
			kind: PendingWorktreeError["kind"];
			message?: string;
			result?: WorktreeCommandResult;
	  };

export interface InMemoryCheckpointGatewayState {
	snapshot?: FakePendingWorktreeSnapshotState;
	commit?: { summary: string } | { error: string };
}

export interface CheckpointLoadCall {
	cwd: string;
}

export interface CheckpointCommitCall {
	cwd: string;
	message: string;
}

export class InMemoryCheckpointGateway implements CheckpointGateway {
	private readonly snapshotState: FakePendingWorktreeSnapshotState;
	private readonly commitResult: { summary: string } | { error: string };
	private readonly loadLog: CheckpointLoadCall[] = [];
	private readonly commitLog: CheckpointCommitCall[] = [];

	constructor(state: InMemoryCheckpointGatewayState = {}) {
		this.snapshotState = copySnapshotState(state.snapshot ?? defaultPendingWorktreeSnapshot());
		this.commitResult = state.commit ?? { summary: "abc123 [cp] Update checkpoint tests" };
	}

	get loadPendingWorktreeCalls(): readonly CheckpointLoadCall[] {
		return this.loadLog.map((call) => ({ ...call }));
	}

	get createCommitWithPreparedMessageCalls(): readonly CheckpointCommitCall[] {
		return this.commitLog.map((call) => ({ ...call }));
	}

	async loadPendingWorktreeSnapshot(params: { cwd: string }): Promise<
		| {
				ok: true;
				snapshot: PendingWorktreeSnapshot;
			}
		| {
				ok: false;
				error: PendingWorktreeError;
			}
	> {
		this.loadLog.push({ cwd: params.cwd });
		if (isPendingWorktreeFailureState(this.snapshotState)) {
			return { ok: false, error: pendingWorktreeFailure(this.snapshotState) };
		}
		return { ok: true, snapshot: copySnapshot(this.snapshotState) };
	}

	async createCommitWithPreparedMessage(params: { cwd: string; message: string }): Promise<{ summary: string } | { error: string }> {
		this.commitLog.push({ cwd: params.cwd, message: params.message });
		return this.commitResult;
	}
}

export interface InMemorySubmitGatewayState {
	preflight?: SubmitPreflightResult;
	restack?: SubmitRestackResult;
	submit?: SubmitRunResult;
	currentPr?: CurrentPrVerificationResult;
}

export interface SubmitGatewayCall {
	cwd: string;
}

export type SubmitGatewayOperation = "checkSubmitReadiness" | "restackCurrentStack" | "submitCurrentStack" | "verifyCurrentPr";

export interface SubmitGatewayOperationCall extends SubmitGatewayCall {
	operation: SubmitGatewayOperation;
}

export class InMemorySubmitGateway implements SubmitGateway {
	private readonly preflightResult: SubmitPreflightResult;
	private readonly restackResult: SubmitRestackResult;
	private readonly submitResult: SubmitRunResult;
	private readonly currentPrResult: CurrentPrVerificationResult;
	private readonly preflightLog: SubmitGatewayCall[] = [];
	private readonly restackLog: SubmitGatewayCall[] = [];
	private readonly submitLog: SubmitGatewayCall[] = [];
	private readonly currentPrLog: SubmitGatewayCall[] = [];
	private readonly operationLog: SubmitGatewayOperationCall[] = [];

	constructor(state: InMemorySubmitGatewayState = {}) {
		this.preflightResult = copySubmitPreflightResult(state.preflight ?? { kind: "ready", output: defaultSubmitOutput() });
		this.restackResult = copySubmitRestackResult(state.restack ?? { kind: "success", output: defaultSubmitOutput("restacked\n") });
		this.submitResult = copySubmitRunResult(
			state.submit ?? {
				kind: "success",
				output: defaultSubmitOutput("Created PR https://github.com/acme/project/pull/123\n"),
				prLinks: [{ label: "#123", url: "https://github.com/acme/project/pull/123" }],
			},
		);
		this.currentPrResult = copyCurrentPrVerificationResult(
			state.currentPr ?? {
				kind: "present",
				output: defaultSubmitOutput("https://github.com/acme/project/pull/123\n"),
				prLinks: [{ label: "#123", url: "https://github.com/acme/project/pull/123" }],
			},
		);
	}

	get checkSubmitReadinessCalls(): readonly SubmitGatewayCall[] {
		return this.preflightLog.map((call) => ({ ...call }));
	}

	get restackCurrentStackCalls(): readonly SubmitGatewayCall[] {
		return this.restackLog.map((call) => ({ ...call }));
	}

	get submitCurrentStackCalls(): readonly SubmitGatewayCall[] {
		return this.submitLog.map((call) => ({ ...call }));
	}

	get verifyCurrentPrCalls(): readonly SubmitGatewayCall[] {
		return this.currentPrLog.map((call) => ({ ...call }));
	}

	get operationCalls(): readonly SubmitGatewayOperationCall[] {
		return this.operationLog.map((call) => ({ ...call }));
	}

	async checkSubmitReadiness(params: SubmitCommandParams): Promise<SubmitPreflightResult> {
		this.preflightLog.push({ cwd: params.cwd });
		this.operationLog.push({ operation: "checkSubmitReadiness", cwd: params.cwd });
		emitSubmitOutput(params, this.preflightResult.output);
		return copySubmitPreflightResult(this.preflightResult);
	}

	async restackCurrentStack(params: SubmitCommandParams): Promise<SubmitRestackResult> {
		this.restackLog.push({ cwd: params.cwd });
		this.operationLog.push({ operation: "restackCurrentStack", cwd: params.cwd });
		emitSubmitOutput(params, this.restackResult.output);
		return copySubmitRestackResult(this.restackResult);
	}

	async submitCurrentStack(params: SubmitCommandParams): Promise<SubmitRunResult> {
		this.submitLog.push({ cwd: params.cwd });
		this.operationLog.push({ operation: "submitCurrentStack", cwd: params.cwd });
		emitSubmitOutput(params, this.submitResult.output);
		return copySubmitRunResult(this.submitResult);
	}

	async verifyCurrentPr(params: SubmitCommandParams): Promise<CurrentPrVerificationResult> {
		this.currentPrLog.push({ cwd: params.cwd });
		this.operationLog.push({ operation: "verifyCurrentPr", cwd: params.cwd });
		emitSubmitOutput(params, this.currentPrResult.output);
		return copyCurrentPrVerificationResult(this.currentPrResult);
	}
}

export interface InMemoryTextGenerationGatewayState {
	results?: readonly TextGenerationResult[];
}

export class InMemoryTextGenerationGateway implements TextGenerationGateway {
	private readonly results: TextGenerationResult[];
	private readonly callLog: TextGenerationRequest[] = [];

	constructor(state: InMemoryTextGenerationGatewayState = {}) {
		this.results = [...(state.results ?? [{ ok: true, text: defaultCheckpointMessage() }])];
	}

	get generateTextCalls(): readonly TextGenerationRequest[] {
		return this.callLog.map(copyTextGenerationRequest);
	}

	async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
		this.callLog.push(copyTextGenerationRequest(request));
		return this.results.shift() ?? { ok: true, text: defaultCheckpointMessage() };
	}
}

export interface FakeVercelDeploymentRecord {
	project: string;
	scope: string;
	environment: "preview" | "production";
	url: string;
	state: string;
	createdAt: number;
	readyAt?: number;
	meta: Record<string, string>;
	inspection: InspectedDeployment;
}

export interface InMemoryVercelDeploymentGatewayState {
	deployments?: readonly FakeVercelDeploymentRecord[];
	isAvailable?: boolean;
	listFailure?: ErrorInfo;
	inspectFailure?: ErrorInfo;
}

export interface VercelListCall {
	project: string;
	scope: string;
	branch: string;
	cwd: string;
}

export interface VercelInspectCall {
	url: string;
	scope: string;
	cwd: string;
}

export class InMemoryVercelDeploymentGateway implements VercelDeploymentGateway {
	private readonly deployments: FakeVercelDeploymentRecord[];
	private readonly isAvailable: boolean;
	private readonly listFailure: ErrorInfo | undefined;
	private readonly inspectFailure: ErrorInfo | undefined;
	private readonly listLog: VercelListCall[] = [];
	private readonly inspectLog: VercelInspectCall[] = [];

	constructor(state: InMemoryVercelDeploymentGatewayState = {}) {
		this.deployments = [...(state.deployments ?? [])].map(copyRecord);
		this.isAvailable = state.isAvailable ?? true;
		this.listFailure = state.listFailure;
		this.inspectFailure = state.inspectFailure;
	}

	get listCalls(): readonly VercelListCall[] {
		return this.listLog.map((call) => ({ ...call }));
	}

	get inspectCalls(): readonly VercelInspectCall[] {
		return this.inspectLog.map((call) => ({ ...call }));
	}

	async listReadyPreviewDeployments(params: {
		project: string;
		scope: string;
		branch: string;
		cwd: string;
	}): Promise<GatewayResult<DeploymentCandidate[]>> {
		this.listLog.push({ project: params.project, scope: params.scope, branch: params.branch, cwd: params.cwd });
		if (!this.isAvailable) {
			return err(vercelUnavailableError());
		}
		if (this.listFailure !== undefined) {
			return err(this.listFailure);
		}

		const candidates = this.deployments
			.filter((deployment) => deployment.project === params.project)
			.filter((deployment) => deployment.scope === params.scope)
			.filter((deployment) => deployment.environment === "preview")
			.filter((deployment) => deployment.state === "READY")
			.filter((deployment) => deployment.meta.githubCommitRef === params.branch)
			.map(toCandidate);
		return ok(candidates);
	}

	async inspectDeployment(params: { url: string; scope: string; cwd: string }): Promise<GatewayResult<InspectedDeployment>> {
		this.inspectLog.push({ url: params.url, scope: params.scope, cwd: params.cwd });
		if (!this.isAvailable) {
			return err(vercelUnavailableError());
		}
		if (this.inspectFailure !== undefined) {
			return err(this.inspectFailure);
		}

		const requestedUrl = normalizeUrl(params.url);
		const found = this.deployments.find(
			(deployment) =>
				deployment.scope === params.scope &&
				(normalizeUrl(deployment.url) === requestedUrl || normalizeUrl(deployment.inspection.url) === requestedUrl),
		);
		if (found === undefined) {
			return err({ code: "vercel_inspect_not_found", message: `No fake Vercel deployment found for ${params.url}.` });
		}

		return ok(copyInspection(found.inspection));
	}
}

export class InMemoryVercelProjectConfigStore implements VercelProjectConfigStore {
	private readonly result: ProjectConfigReadResult;
	private readonly readLog: { repoRoot: string }[] = [];

	constructor(result: ProjectConfigReadResult = { kind: "missing" }) {
		this.result = copyProjectConfigResult(result);
	}

	get readProjectConfigCalls(): readonly { repoRoot: string }[] {
		return this.readLog.map((call) => ({ ...call }));
	}

	async readProjectConfig(params: { repoRoot: string }): Promise<ProjectConfigReadResult> {
		this.readLog.push({ repoRoot: params.repoRoot });
		return copyProjectConfigResult(this.result);
	}
}

export interface InMemoryContextState {
	git?: InMemoryGitGatewayState;
	vercel?: InMemoryVercelDeploymentGatewayState;
	projectConfig?: ProjectConfigReadResult;
	checkpoint?: InMemoryCheckpointGatewayState;
	submit?: InMemorySubmitGatewayState;
	textGeneration?: InMemoryTextGenerationGatewayState;
}

export function inMemoryContext(state: InMemoryContextState = {}): {
	context: AsdlDevContext;
	git: InMemoryGitGateway;
	vercel: InMemoryVercelDeploymentGateway;
	projectConfig: InMemoryVercelProjectConfigStore;
	checkpoint: InMemoryCheckpointGateway;
	submit: InMemorySubmitGateway;
	textGeneration: InMemoryTextGenerationGateway;
} {
	const git = new InMemoryGitGateway(state.git);
	const vercel = new InMemoryVercelDeploymentGateway(state.vercel);
	const projectConfig = new InMemoryVercelProjectConfigStore(state.projectConfig);
	const checkpoint = new InMemoryCheckpointGateway(state.checkpoint);
	const submit = new InMemorySubmitGateway(state.submit);
	const textGeneration = new InMemoryTextGenerationGateway(state.textGeneration);
	return {
		context: { git, vercel, projectConfig, checkpoint, submit, textGeneration },
		git,
		vercel,
		projectConfig,
		checkpoint,
		submit,
		textGeneration,
	};
}

function defaultSubmitOutput(stdout = "", stderr = "", exitCode = 0): SubmitCommandOutput {
	return { stdout, stderr, exitCode };
}

function emitSubmitOutput(params: SubmitCommandParams, output: SubmitCommandOutput): void {
	if (output.stdout !== "") {
		params.onOutput?.("stdout", output.stdout);
	}
	if (output.stderr !== "") {
		params.onOutput?.("stderr", output.stderr);
	}
}

function copySubmitOutput(output: SubmitCommandOutput): SubmitCommandOutput {
	return {
		stdout: output.stdout,
		stderr: output.stderr,
		exitCode: output.exitCode,
		...(output.startupError !== undefined ? { startupError: output.startupError } : {}),
		...(output.killed === true ? { killed: true } : {}),
	};
}

function copySubmitPreflightResult(result: SubmitPreflightResult): SubmitPreflightResult {
	if (result.kind === "ready") {
		return { kind: "ready", output: copySubmitOutput(result.output) };
	}
	if (result.kind === "restack_required") {
		return { kind: "restack_required", output: copySubmitOutput(result.output) };
	}
	return { kind: "failed", output: copySubmitOutput(result.output) };
}

function copySubmitRestackResult(result: SubmitRestackResult): SubmitRestackResult {
	if (result.kind === "success") {
		return { kind: "success", output: copySubmitOutput(result.output) };
	}
	if (result.kind === "conflict") {
		return { kind: "conflict", output: copySubmitOutput(result.output), conflictedFiles: [...result.conflictedFiles] };
	}
	return { kind: "failed", output: copySubmitOutput(result.output) };
}

function copySubmitRunResult(result: SubmitRunResult): SubmitRunResult {
	if (result.kind === "failed") {
		return { kind: "failed", output: copySubmitOutput(result.output) };
	}
	return {
		kind: "success",
		output: copySubmitOutput(result.output),
		prLinks: result.prLinks.map((link) => ({ ...link })),
		...(result.semanticFailureCause !== undefined ? { semanticFailureCause: result.semanticFailureCause } : {}),
	};
}

function copyCurrentPrVerificationResult(result: CurrentPrVerificationResult): CurrentPrVerificationResult {
	if (result.kind === "present") {
		return { kind: "present", output: copySubmitOutput(result.output), prLinks: result.prLinks.map((link) => ({ ...link })) };
	}
	if (result.kind === "no_current_pr") {
		return { kind: "no_current_pr", output: copySubmitOutput(result.output), cause: result.cause };
	}
	return { kind: "failed", output: copySubmitOutput(result.output), cause: result.cause };
}

function defaultPendingWorktreeSnapshot(): PendingWorktreeSnapshot {
	return {
		root: "/repo",
		branch: "feature/demo",
		status: " M ts/packages/asdl-dev/src/cli.ts\n",
		diff: "diff --git a/ts/packages/asdl-dev/src/cli.ts b/ts/packages/asdl-dev/src/cli.ts\n",
		clean: false,
	};
}

function defaultCheckpointMessage(): string {
	return `[cp] Update checkpoint tests

- Add checkpoint CLI coverage`;
}

function isPendingWorktreeFailureState(
	state: FakePendingWorktreeSnapshotState,
): state is Extract<FakePendingWorktreeSnapshotState, { kind: PendingWorktreeError["kind"] }> {
	return "kind" in state;
}

function pendingWorktreeFailure(state: Extract<FakePendingWorktreeSnapshotState, { kind: PendingWorktreeError["kind"] }>): PendingWorktreeError {
	const result = state.result ?? failedWorktreeResult();
	if (state.kind === "not_git_repo") {
		return { kind: "not_git_repo", message: state.message ?? "Not inside a git repository.", result };
	}
	if (state.kind === "detached_head") {
		return { kind: "detached_head", message: state.message ?? "Detached HEAD.", result };
	}
	if (state.kind === "status_failed") {
		return { kind: "status_failed", message: state.message ?? "Could not read git status.", result };
	}
	return { kind: "diff_failed", message: state.message ?? "Could not read git diff.", result };
}

function failedWorktreeResult(): WorktreeCommandResult {
	return { code: 1, stdout: "", stderr: "git failed" };
}

function copySnapshotState(state: FakePendingWorktreeSnapshotState): FakePendingWorktreeSnapshotState {
	if (isPendingWorktreeFailureState(state)) {
		const copy: Extract<FakePendingWorktreeSnapshotState, { kind: PendingWorktreeError["kind"] }> = { kind: state.kind };
		if (state.message !== undefined) {
			copy.message = state.message;
		}
		if (state.result !== undefined) {
			copy.result = { ...state.result };
		}
		return copy;
	}
	return copySnapshot(state);
}

function copySnapshot(snapshot: PendingWorktreeSnapshot): PendingWorktreeSnapshot {
	return { ...snapshot };
}

function copyTextGenerationRequest(request: TextGenerationRequest): TextGenerationRequest {
	const copy: TextGenerationRequest = {
		modelRef: request.modelRef,
		system: request.system,
		prompt: request.prompt,
	};
	if (request.maxTokens !== undefined) {
		copy.maxTokens = request.maxTokens;
	}
	if (request.reasoning !== undefined) {
		copy.reasoning = request.reasoning;
	}
	if (request.operation !== undefined) {
		copy.operation = request.operation;
	}
	return copy;
}

function toCandidate(record: FakeVercelDeploymentRecord): DeploymentCandidate {
	const candidate: DeploymentCandidate = {
		url: record.url,
		state: record.state,
		createdAt: record.createdAt,
		meta: { ...record.meta },
	};
	if (record.readyAt !== undefined) {
		candidate.readyAt = record.readyAt;
	}
	return candidate;
}

function copyRecord(record: FakeVercelDeploymentRecord): FakeVercelDeploymentRecord {
	const copy: FakeVercelDeploymentRecord = {
		project: record.project,
		scope: record.scope,
		environment: record.environment,
		url: record.url,
		state: record.state,
		createdAt: record.createdAt,
		meta: { ...record.meta },
		inspection: copyInspection(record.inspection),
	};
	if (record.readyAt !== undefined) {
		copy.readyAt = record.readyAt;
	}
	return copy;
}

function copyInspection(inspection: InspectedDeployment): InspectedDeployment {
	return {
		id: inspection.id,
		url: inspection.url,
		aliases: [...inspection.aliases],
	};
}

function copyProjectConfigResult(result: ProjectConfigReadResult): ProjectConfigReadResult {
	if (result.kind === "found") {
		return { kind: "found", projectName: result.projectName };
	}
	if (result.kind === "read_error") {
		const copy: ProjectConfigReadResult = { kind: "read_error" };
		if (result.message !== undefined) {
			copy.message = result.message;
		}
		return copy;
	}
	return { kind: result.kind };
}

function vercelUnavailableError(): ErrorInfo {
	return {
		code: "vercel_cli_unavailable",
		message: "Neither vercel nor pnpm was found on PATH; cannot query Vercel deployments.",
	};
}

function detachedHeadError(): ErrorInfo {
	return {
		code: "detached_head",
		message: "Could not determine current branch; HEAD may be detached. Pass --branch to select a branch explicitly.",
	};
}

function normalizeUrl(value: string): string {
	return value.replace(/^https?:\/\//, "");
}

function nonBlank(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}
