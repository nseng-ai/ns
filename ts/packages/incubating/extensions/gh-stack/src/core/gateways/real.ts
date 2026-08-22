import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
	commandFailureReason,
	commandSucceeded,
	type CommandExecApi,
	type ExecResult,
} from "@nseng-ai/foundation/exec";
import type { GitGateway } from "@nseng-ai/foundation/git";

import type {
	InstallationVerificationResult,
	LocalStackInventoryResult,
	RemoteStackInventoryResult,
} from "../types.ts";
import type {
	GhStackInstallationGateway,
	GhStackListContext,
	GhStackLocalInventoryGateway,
	GhStackRemoteInventoryGateway,
} from "./contracts.ts";
import { parseLocalStackFile, parseRemoteStackPages } from "./schemas.ts";

const PROVIDER_TIMEOUT_MS = 15_000;
const MAX_EVIDENCE_CHARS = 500;
const STACK_VERSION_COMMAND = "gh stack --version";
const STACK_API_COMMAND = "gh api repos/{owner}/{repo}/stacks --paginate --slurp";

export type GhStackGitGateway = Pick<GitGateway, "gitCommonDir">;

export type GhStackStateReadResult =
	| { readonly type: "found"; readonly text: string }
	| { readonly type: "missing" }
	| { readonly type: "failure"; readonly summary: string };

export interface GhStackStateReader {
	readState(path: string): Promise<GhStackStateReadResult>;
}

export interface CreateRealGhStackListContextOptions {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly exec: CommandExecApi;
	readonly git: GhStackGitGateway;
	readonly stateReader?: GhStackStateReader;
}

export function createRealGhStackListContext(
	options: CreateRealGhStackListContextOptions,
): GhStackListContext {
	return {
		installation: new RealGhStackInstallationGateway(options),
		local: new RealGhStackLocalInventoryGateway(options),
		remote: new RealGhStackRemoteInventoryGateway(options),
	};
}

export class RealGhStackInstallationGateway implements GhStackInstallationGateway {
	private readonly cwd: string;
	private readonly env: NodeJS.ProcessEnv;
	private readonly exec: CommandExecApi;

	constructor(options: Pick<CreateRealGhStackListContextOptions, "cwd" | "env" | "exec">) {
		this.cwd = options.cwd;
		this.env = options.env;
		this.exec = options.exec;
	}

	async verifyInstallation(): Promise<InstallationVerificationResult> {
		const result = await this.exec.exec(
			"gh",
			["stack", "--version"],
			commandOptions(this.cwd, this.env),
		);
		if (!commandSucceeded(result)) {
			return {
				ok: false,
				error: {
					type: "gh-stack-extension-unavailable",
					evidence: commandEvidence(STACK_VERSION_COMMAND, this.cwd, result),
				},
			};
		}
		const version = result.stdout.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
		if (version === "") {
			return {
				ok: false,
				error: {
					type: "gh-stack-extension-unavailable",
					evidence: {
						command: STACK_VERSION_COMMAND,
						cwd: this.cwd,
						summary: "version command returned no version",
					},
				},
			};
		}
		return { ok: true, version: sanitize(version) };
	}
}

export class RealGhStackLocalInventoryGateway implements GhStackLocalInventoryGateway {
	private readonly cwd: string;
	private readonly env: NodeJS.ProcessEnv;
	private readonly git: GhStackGitGateway;
	private readonly stateReader: GhStackStateReader;

	constructor(options: CreateRealGhStackListContextOptions) {
		this.cwd = options.cwd;
		this.env = options.env;
		this.git = options.git;
		this.stateReader = options.stateReader ?? nodeGhStackStateReader;
	}

	async loadLocalStacks(): Promise<LocalStackInventoryResult> {
		const commonDir = await this.git.gitCommonDir({ cwd: this.cwd, env: this.env });
		if (!commonDir.ok) {
			return {
				ok: false,
				error: {
					type: "git-repository-unavailable",
					evidence: {
						cwd: this.cwd,
						summary: sanitize(commonDir.error.message),
						...(commonDir.error.displayCommand === undefined
							? {}
							: { command: commonDir.error.displayCommand }),
					},
				},
			};
		}
		const statePath = join(commonDir.value, "gh-stack");
		const read = await this.stateReader.readState(statePath);
		if (read.type === "missing") return { ok: true, value: [] };
		if (read.type === "failure") {
			return {
				ok: false,
				error: {
					type: "gh-stack-state-read-failed",
					evidence: { cwd: this.cwd, detail: statePath, summary: sanitize(read.summary) },
				},
			};
		}
		let input: unknown;
		try {
			input = JSON.parse(read.text);
		} catch {
			return {
				ok: false,
				error: {
					type: "gh-stack-state-unsupported",
					evidence: { cwd: this.cwd, detail: statePath, summary: "local state is not valid JSON" },
				},
			};
		}
		const parsed = parseLocalStackFile(input);
		if (!parsed.ok) {
			return {
				ok: false,
				error: {
					type: "gh-stack-state-unsupported",
					evidence: { cwd: this.cwd, detail: statePath, summary: parsed.detail },
				},
			};
		}
		return parsed;
	}
}

export class RealGhStackRemoteInventoryGateway implements GhStackRemoteInventoryGateway {
	private readonly cwd: string;
	private readonly env: NodeJS.ProcessEnv;
	private readonly exec: CommandExecApi;

	constructor(options: Pick<CreateRealGhStackListContextOptions, "cwd" | "env" | "exec">) {
		this.cwd = options.cwd;
		this.env = options.env;
		this.exec = options.exec;
	}

	async loadRemoteStacks(): Promise<RemoteStackInventoryResult> {
		const result = await this.exec.exec(
			"gh",
			["api", "repos/{owner}/{repo}/stacks", "--paginate", "--slurp"],
			commandOptions(this.cwd, this.env),
		);
		if (!commandSucceeded(result)) {
			const evidence = commandEvidence(STACK_API_COMMAND, this.cwd, result);
			return resultIsNotFound(result)
				? { ok: false, error: { type: "github-stacks-unavailable", evidence } }
				: { ok: false, error: { type: "github-stack-discovery-failed", evidence } };
		}
		let input: unknown;
		try {
			input = JSON.parse(result.stdout);
		} catch {
			return {
				ok: false,
				error: {
					type: "github-stack-response-unsupported",
					evidence: {
						command: STACK_API_COMMAND,
						cwd: this.cwd,
						summary: "GitHub Stacks response is not valid JSON",
					},
				},
			};
		}
		const parsed = parseRemoteStackPages(input);
		if (!parsed.ok) {
			return {
				ok: false,
				error: {
					type: "github-stack-response-unsupported",
					evidence: { command: STACK_API_COMMAND, cwd: this.cwd, summary: parsed.detail },
				},
			};
		}
		return parsed;
	}
}

export const nodeGhStackStateReader: GhStackStateReader = {
	async readState(path): Promise<GhStackStateReadResult> {
		try {
			return { type: "found", text: await readFile(path, "utf8") };
		} catch (error) {
			if (isNodeErrorWithCode(error, "ENOENT")) return { type: "missing" };
			return { type: "failure", summary: error instanceof Error ? error.message : String(error) };
		}
	},
};

function commandOptions(cwd: string, env: NodeJS.ProcessEnv) {
	return { cwd, env, timeout: PROVIDER_TIMEOUT_MS };
}

function commandEvidence(command: string, cwd: string, result: ExecResult) {
	const stderr = result.stderr.trim();
	const stdout = result.stdout.trim();
	return {
		command,
		cwd,
		summary: sanitize(stderr || stdout || commandFailureReason(result)),
	};
}

function resultIsNotFound(result: ExecResult): boolean {
	return /\b404\b/.test(`${result.stderr}\n${result.stdout}`);
}

function sanitize(value: string): string {
	return value
		.replace(
			/(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|bearer\s+\S+)/gi,
			"[redacted]",
		)
		.replace(/[\r\n\t ]+/g, " ")
		.trim()
		.slice(0, MAX_EVIDENCE_CHARS);
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
	return error instanceof Error && "code" in error && error.code === code;
}
