import { spawnSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { formatError } from "./error-format.ts";

export interface PypiPublishGateway {
	ensurePublishToolsAvailable(): string | null;
	buildPackage(projectDir: string): PypiBuildResult;
	publishArtifacts(projectDir: string, artifacts: readonly string[]): string | null;
}

export type PypiBuildResult = { artifacts: string[] } | { error: string };

export interface NpmPublishGateway {
	ensurePublishToolsAvailable(): string | null;
	publishProject(projectDir: string): string | null;
}

export type ToolFinder = (toolName: string) => boolean;
export type CommandRunner = (command: readonly string[], cwd: string) => PublishCommandResult;

export interface PublishCommandResult {
	returnCode: number;
	stdout: string;
	stderr: string;
}

export class RealPypiPublishGateway implements PypiPublishGateway {
	private readonly toolFinder: ToolFinder;
	private readonly commandRunner: CommandRunner;

	constructor(options: { toolFinder?: ToolFinder; commandRunner?: CommandRunner } = {}) {
		this.toolFinder = options.toolFinder ?? toolAvailable;
		this.commandRunner = options.commandRunner ?? runPublishCommand;
	}

	ensurePublishToolsAvailable(): string | null {
		if (!this.toolFinder("uv"))
			return "Required tool 'uv' is not available. Install uv to build and publish packages.";
		if (!this.toolFinder("uvx"))
			return "Required tool 'uvx' is not available. Install uv to build and publish packages.";
		return null;
	}

	buildPackage(projectDir: string): PypiBuildResult {
		const distDir = join(projectDir, "dist");
		try {
			if (exists(distDir)) {
				if (!statSync(distDir).isDirectory()) {
					return buildFailure(
						`Cannot prepare dist directory because it is not a directory: ${distDir}`,
					);
				}
				rmSync(distDir, { recursive: true, force: true });
			}
			const command = ["uv", "build"];
			const result = this.commandRunner(command, projectDir);
			if (result.returnCode !== 0) return buildFailure(formatCommandFailure(command, result));
			if (!exists(distDir)) return buildFailure("uv build did not create a dist/ directory");
			if (!statSync(distDir).isDirectory())
				return buildFailure("uv build created dist, but it is not a directory");
			const artifacts = readdirSync(distDir)
				.map((name) => join(distDir, name))
				.filter((path) => statSync(path).isFile())
				.sort();
			if (artifacts.length === 0)
				return buildFailure("uv build did not produce any artifacts in dist/");
			return { artifacts };
		} catch (error) {
			return buildFailure(`uv build failed to start: ${formatError(error)}`);
		}
	}

	publishArtifacts(projectDir: string, artifacts: readonly string[]): string | null {
		if (artifacts.length === 0) return "No distribution artifacts to publish.";
		const command = ["uvx", "uv-publish", ...artifacts];
		try {
			const result = this.commandRunner(command, projectDir);
			return result.returnCode === 0 ? null : formatCommandFailure(command, result);
		} catch (error) {
			return `${formatCommand(command)} failed to start: ${formatError(error)}`;
		}
	}
}

export class FakePypiPublishGateway implements PypiPublishGateway {
	private readonly toolsError: string | null;
	private readonly buildError: string | null;
	private readonly publishError: string | null;
	private readonly artifacts: readonly string[];
	private toolCheckCount = 0;
	private readonly builtDirs: string[] = [];
	private readonly published: string[][] = [];

	constructor(
		options: {
			toolsError?: string;
			buildError?: string;
			publishError?: string;
			artifacts?: readonly string[];
		} = {},
	) {
		this.toolsError = options.toolsError ?? null;
		this.buildError = options.buildError ?? null;
		this.publishError = options.publishError ?? null;
		this.artifacts = [...(options.artifacts ?? [])];
	}

	get toolChecks(): number {
		return this.toolCheckCount;
	}

	get builtProjectDirs(): string[] {
		return [...this.builtDirs];
	}

	get publishedArtifacts(): string[][] {
		return this.published.map((artifacts) => [...artifacts]);
	}

	ensurePublishToolsAvailable(): string | null {
		this.toolCheckCount += 1;
		return this.toolsError;
	}

	buildPackage(projectDir: string): PypiBuildResult {
		this.builtDirs.push(projectDir);
		if (this.buildError !== null) return { error: this.buildError };
		return { artifacts: [...this.artifacts] };
	}

	publishArtifacts(_projectDir: string, artifacts: readonly string[]): string | null {
		this.published.push([...artifacts]);
		return this.publishError;
	}
}

export class RealNpmPublishGateway implements NpmPublishGateway {
	private readonly toolFinder: ToolFinder;
	private readonly commandRunner: CommandRunner;

	constructor(options: { toolFinder?: ToolFinder; commandRunner?: CommandRunner } = {}) {
		this.toolFinder = options.toolFinder ?? toolAvailable;
		this.commandRunner = options.commandRunner ?? runPublishCommand;
	}

	ensurePublishToolsAvailable(): string | null {
		if (!this.toolFinder("npm"))
			return "Required tool 'npm' is not available. Install Node.js to publish packages.";
		return null;
	}

	publishProject(projectDir: string): string | null {
		const command = ["npm", "publish", "--access=public"];
		try {
			const result = this.commandRunner(command, projectDir);
			return result.returnCode === 0 ? null : formatCommandFailure(command, result);
		} catch (error) {
			return `${formatCommand(command)} failed to start: ${formatError(error)}`;
		}
	}
}

export class FakeNpmPublishGateway implements NpmPublishGateway {
	private readonly toolsError: string | null;
	private readonly publishError: string | null;
	private toolCheckCount = 0;
	private readonly publishedDirs: string[] = [];

	constructor(options: { toolsError?: string; publishError?: string } = {}) {
		this.toolsError = options.toolsError ?? null;
		this.publishError = options.publishError ?? null;
	}

	get toolChecks(): number {
		return this.toolCheckCount;
	}

	get publishedProjectDirs(): string[] {
		return [...this.publishedDirs];
	}

	ensurePublishToolsAvailable(): string | null {
		this.toolCheckCount += 1;
		return this.toolsError;
	}

	publishProject(projectDir: string): string | null {
		this.publishedDirs.push(projectDir);
		return this.publishError;
	}
}

function toolAvailable(toolName: string): boolean {
	const command = process.platform === "win32" ? "where" : "command";
	const args = process.platform === "win32" ? [toolName] : ["-v", toolName];
	return spawnSync(command, args, { shell: process.platform !== "win32" }).status === 0;
}

function runPublishCommand(command: readonly string[], cwd: string): PublishCommandResult {
	const [file, ...args] = command;
	if (file === undefined) throw new Error("cannot run an empty command");
	const result = spawnSync(file, args, { cwd, encoding: "utf8" });
	if (result.error !== undefined) throw result.error;
	return {
		returnCode: result.status ?? 1,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

function formatCommandFailure(command: readonly string[], result: PublishCommandResult): string {
	const output = result.stderr.trim() || result.stdout.trim() || "no output";
	return `${formatCommand(command)} failed with exit code ${result.returnCode}: ${output}`;
}

function formatCommand(command: readonly string[]): string {
	return command.map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
	if (/^[A-Za-z0-9_/@%+=:,.-]+$/.test(value)) return value;
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildFailure(error: string): PypiBuildResult {
	return { error };
}

function exists(path: string): boolean {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}
