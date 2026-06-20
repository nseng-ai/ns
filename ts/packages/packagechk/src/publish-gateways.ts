import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import {
	defaultCommandResolver,
	formatCommand,
	formatCommandFailure as formatExecCommandFailure,
	formatCommandStartupFailure,
	runCommand,
	type ExecResult,
} from "@asdl/core/exec";
import { formatErrorMessage } from "@asdl/core/primitives";

export interface PypiPublishGateway {
	ensurePublishToolsAvailable(): string | null;
	buildPackage(projectDir: string): Promise<PypiBuildResult>;
	publishArtifacts(projectDir: string, artifacts: readonly string[]): Promise<string | null>;
}

export type PypiBuildResult = { artifacts: string[] } | { error: string };

export interface NpmPublishGateway {
	ensurePublishToolsAvailable(): string | null;
	publishProject(projectDir: string): Promise<string | null>;
}

export type ToolFinder = (toolName: string) => string | undefined;
export type CommandRunner = (
	command: string,
	args: readonly string[],
	options: { cwd: string },
) => Promise<ExecResult>;

export class RealPypiPublishGateway implements PypiPublishGateway {
	private readonly toolFinder: ToolFinder;
	private readonly commandRunner: CommandRunner;

	constructor(options: { toolFinder?: ToolFinder; commandRunner?: CommandRunner } = {}) {
		this.toolFinder = options.toolFinder ?? defaultCommandResolver;
		this.commandRunner = options.commandRunner ?? runPublishCommand;
	}

	ensurePublishToolsAvailable(): string | null {
		if (this.toolFinder("uv") === undefined)
			return "Required tool 'uv' is not available. Install uv to build and publish packages.";
		if (this.toolFinder("uvx") === undefined)
			return "Required tool 'uvx' is not available. Install uv to build and publish packages.";
		return null;
	}

	async buildPackage(projectDir: string): Promise<PypiBuildResult> {
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
			const result = await this.commandRunner("uv", ["build"], { cwd: projectDir });
			if (result.code !== 0) {
				return buildFailure(
					formatPublishCommandFailure("uv build failed", "uv", ["build"], result),
				);
			}
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
			return buildFailure(`uv build failed: ${formatErrorMessage(error)}`);
		}
	}

	async publishArtifacts(projectDir: string, artifacts: readonly string[]): Promise<string | null> {
		if (artifacts.length === 0) return "No distribution artifacts to publish.";
		const command = "uvx";
		const args = ["uv-publish", ...artifacts];
		try {
			const result = await this.commandRunner(command, args, { cwd: projectDir });
			return result.code === 0
				? null
				: formatPublishCommandFailure("uvx uv-publish failed", command, args, result);
		} catch (error) {
			return formatCommandStartupFailure(
				"uvx uv-publish failed",
				formatCommand(command, args),
				error,
			);
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

	async buildPackage(projectDir: string): Promise<PypiBuildResult> {
		this.builtDirs.push(projectDir);
		if (this.buildError !== null) return { error: this.buildError };
		return { artifacts: [...this.artifacts] };
	}

	async publishArtifacts(
		_projectDir: string,
		artifacts: readonly string[],
	): Promise<string | null> {
		this.published.push([...artifacts]);
		return this.publishError;
	}
}

export class RealNpmPublishGateway implements NpmPublishGateway {
	private readonly toolFinder: ToolFinder;
	private readonly commandRunner: CommandRunner;

	constructor(options: { toolFinder?: ToolFinder; commandRunner?: CommandRunner } = {}) {
		this.toolFinder = options.toolFinder ?? defaultCommandResolver;
		this.commandRunner = options.commandRunner ?? runPublishCommand;
	}

	ensurePublishToolsAvailable(): string | null {
		if (this.toolFinder("npm") === undefined)
			return "Required tool 'npm' is not available. Install Node.js to publish packages.";
		return null;
	}

	async publishProject(projectDir: string): Promise<string | null> {
		const command = "npm";
		const args = ["publish", "--access=public"];
		try {
			const result = await this.commandRunner(command, args, { cwd: projectDir });
			return result.code === 0
				? null
				: formatPublishCommandFailure("npm publish failed", command, args, result);
		} catch (error) {
			return formatCommandStartupFailure("npm publish failed", formatCommand(command, args), error);
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

	async publishProject(projectDir: string): Promise<string | null> {
		this.publishedDirs.push(projectDir);
		return this.publishError;
	}
}

async function runPublishCommand(
	command: string,
	args: readonly string[],
	options: { cwd: string },
): Promise<ExecResult> {
	return await runCommand(command, args, options);
}

function formatPublishCommandFailure(
	title: string,
	command: string,
	args: readonly string[],
	result: ExecResult,
): string {
	const displayCommand = formatCommand(command, args);
	if (result.startupError !== undefined) {
		return formatCommandStartupFailure(title, displayCommand, result.startupError);
	}
	return formatExecCommandFailure(title, displayCommand, result);
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
