import { parseGitHubRepository } from "../mint/contracts.ts";

export const SANDBOX_HELLO_MARKER = "__NS_SANDBOX_HELLO_PROBE_V1__";
export const SANDBOX_HELLO_TIMEOUT_MS = 120_000;
export const SANDBOX_HELLO_COMMAND = {
	cmd: "sh",
	args: ["-c", `printf '%s\\n' '${SANDBOX_HELLO_MARKER}' && git rev-parse HEAD`],
} as const;

export interface SandboxHelloProbeOptions {
	readonly repository: string;
	readonly revision: string;
	readonly vercelOidcToken: string;
	readonly vercelProjectId: string;
	readonly vercelTeamId: string;
}

export interface CloneTokenMintGateway {
	mintCloneToken(options: { readonly repository: string }): Promise<CloneTokenMintResult>;
}

export type CloneTokenMintResult =
	| { readonly ok: true; readonly token: string }
	| { readonly ok: false };

export interface VercelSandboxGitSource {
	readonly type: "git";
	readonly url: string;
	readonly username: "x-access-token";
	readonly password: string;
	readonly depth: 1;
	readonly revision: string;
}

export interface VercelSandboxCredentials {
	readonly oidcToken: string;
	readonly projectId: string;
	readonly teamId: string;
}

export interface CreateVercelGitSandboxOptions {
	readonly runtime: "node24";
	readonly persistent: false;
	readonly timeoutMs: number;
	readonly source: VercelSandboxGitSource;
	readonly credentials: VercelSandboxCredentials;
}

export type VercelSandboxCommandResult =
	| {
			readonly ok: true;
			readonly exitCode: number;
			readonly stdout: string;
	  }
	| { readonly ok: false };

export type VercelSandboxCleanupResult = { readonly ok: true } | { readonly ok: false };

export interface VercelSandboxSession {
	readonly name?: string;
	runFixedHelloProbe(): Promise<VercelSandboxCommandResult>;
	stop(): Promise<VercelSandboxCleanupResult>;
}

export type CreateVercelSandboxResult =
	| { readonly ok: true; readonly sandbox: VercelSandboxSession }
	| { readonly ok: false };

export interface VercelSandboxGateway {
	createGitSandbox(options: CreateVercelGitSandboxOptions): Promise<CreateVercelSandboxResult>;
}

export interface SandboxHelloProbeContext {
	readonly cloneTokens: CloneTokenMintGateway;
	readonly sandboxes: VercelSandboxGateway;
}

export type SandboxHelloProbeFailureCode =
	| "invalid-repository"
	| "invalid-revision"
	| "clone-token-mint-failed"
	| "sandbox-create-failed"
	| "probe-command-failed"
	| "probe-output-invalid"
	| "revision-mismatch"
	| "sandbox-cleanup-failed";

export type SandboxHelloProbeResult =
	| {
			readonly ok: true;
			readonly repository: string;
			readonly requestedRevision: string;
			readonly observedSha: string;
			readonly markerOutput: typeof SANDBOX_HELLO_MARKER;
			readonly sandboxName?: string;
	  }
	| {
			readonly ok: false;
			readonly code: SandboxHelloProbeFailureCode;
			readonly message: string;
	  };

export async function runSandboxHelloProbe(
	options: SandboxHelloProbeOptions,
	context: SandboxHelloProbeContext,
): Promise<SandboxHelloProbeResult> {
	const repositoryResult = parseGitHubRepository(options.repository);
	if (!repositoryResult.ok) {
		return failure("invalid-repository", "Repository must be an owner/name GitHub repository.");
	}
	if (!isCommitSha(options.revision)) {
		return failure("invalid-revision", "Revision must be a 40-character commit SHA.");
	}

	const repository = repositoryResult.value;
	const requestedRevision = options.revision.toLowerCase();
	let mintResult: CloneTokenMintResult;
	try {
		mintResult = await context.cloneTokens.mintCloneToken({ repository });
	} catch {
		return failure("clone-token-mint-failed", "Clone token mint failed.");
	}
	if (!mintResult.ok) {
		return failure("clone-token-mint-failed", "Clone token mint failed.");
	}

	let createResult: CreateVercelSandboxResult;
	try {
		createResult = await context.sandboxes.createGitSandbox({
			runtime: "node24",
			persistent: false,
			timeoutMs: SANDBOX_HELLO_TIMEOUT_MS,
			source: {
				type: "git",
				url: `https://github.com/${repository}.git`,
				username: "x-access-token",
				password: mintResult.token,
				depth: 1,
				revision: requestedRevision,
			},
			credentials: {
				oidcToken: options.vercelOidcToken,
				projectId: options.vercelProjectId,
				teamId: options.vercelTeamId,
			},
		});
	} catch {
		return failure("sandbox-create-failed", "Sandbox creation failed.");
	}
	if (!createResult.ok) {
		return failure("sandbox-create-failed", "Sandbox creation failed.");
	}

	const sandbox = createResult.sandbox;
	let probeResult: SandboxHelloProbeResult;
	let cleanupResult: VercelSandboxCleanupResult;
	try {
		try {
			probeResult = await runCreatedSandboxProbe({ repository, requestedRevision, sandbox });
		} catch {
			probeResult = failure("probe-command-failed", "Sandbox probe command failed.");
		}
	} finally {
		try {
			cleanupResult = await sandbox.stop();
		} catch {
			cleanupResult = { ok: false };
		}
	}
	if (!cleanupResult.ok) {
		return failure("sandbox-cleanup-failed", "Sandbox cleanup failed.");
	}
	return probeResult;
}

async function runCreatedSandboxProbe(options: {
	repository: string;
	requestedRevision: string;
	sandbox: VercelSandboxSession;
}): Promise<SandboxHelloProbeResult> {
	const commandResult = await options.sandbox.runFixedHelloProbe();
	if (!commandResult.ok || commandResult.exitCode !== 0) {
		return failure("probe-command-failed", "Sandbox probe command failed.");
	}

	const output = parseProbeOutput(commandResult.stdout);
	if (!output.ok) {
		return failure("probe-output-invalid", "Sandbox probe output was invalid.");
	}
	if (output.observedSha !== options.requestedRevision) {
		return failure("revision-mismatch", "Sandbox checkout revision did not match.");
	}

	const sandboxName = safeSandboxName(options.sandbox.name);
	return {
		ok: true,
		repository: options.repository,
		requestedRevision: options.requestedRevision,
		observedSha: output.observedSha,
		markerOutput: SANDBOX_HELLO_MARKER,
		...(sandboxName === undefined ? {} : { sandboxName }),
	};
}

function parseProbeOutput(
	stdout: string,
): { readonly ok: true; readonly observedSha: string } | { readonly ok: false } {
	const lines = stdout.split(/\r?\n/);
	if (lines.length !== 3 || lines[0] !== SANDBOX_HELLO_MARKER || lines[2] !== "") {
		return { ok: false };
	}
	const observedSha = lines[1];
	if (observedSha === undefined || !isCommitSha(observedSha)) return { ok: false };
	return { ok: true, observedSha: observedSha.toLowerCase() };
}

function isCommitSha(value: string): boolean {
	return /^[0-9a-fA-F]{40}$/.test(value);
}

function safeSandboxName(name: string | undefined): string | undefined {
	if (name === undefined || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) return undefined;
	return name;
}

function failure(code: SandboxHelloProbeFailureCode, message: string): SandboxHelloProbeResult {
	return { ok: false, code, message };
}
