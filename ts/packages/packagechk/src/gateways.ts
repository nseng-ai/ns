import { spawnSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	availableResult,
	errorResult,
	invalidResult,
	takenResult,
	type RegistryCheckResult,
} from "./models.ts";
import {
	brewFormulaValidationError,
	normalizePypiName,
	npmValidationError,
	pypiValidationError,
} from "./validation.ts";

export interface PackageRegistryGateway {
	checkPypi(packageName: string): Promise<RegistryCheckResult>;
	checkNpm(packageName: string): Promise<RegistryCheckResult>;
	checkBrew(packageName: string): Promise<RegistryCheckResult>;
}

export interface PypiPublishGateway {
	ensurePublishToolsAvailable(): string | null;
	buildPackage(projectDir: string): string[] | PypiPublishFailure;
	publishArtifacts(projectDir: string, artifacts: readonly string[]): string | null;
}

export interface PypiPublishFailure {
	type: "pypi_publish_failure";
	message: string;
}

export interface NpmPublishGateway {
	ensurePublishToolsAvailable(): string | null;
	publishProject(projectDir: string): string | null;
}

export interface RegistryHttpResponse {
	statusCode: number;
	jsonBody?: Record<string, unknown> | null;
}

export type RegistryResponseFetcher = (
	url: string,
	timeoutMs: number,
) => Promise<RegistryHttpResponse>;
export type ToolFinder = (toolName: string) => boolean;
export type CommandRunner = (command: readonly string[], cwd: string) => PublishCommandResult;

export interface PublishCommandResult {
	returnCode: number;
	stdout: string;
	stderr: string;
}

export class RealPackageRegistryGateway implements PackageRegistryGateway {
	private readonly responseFetcher: RegistryResponseFetcher;
	private readonly timeoutMs: number;

	constructor(options: { responseFetcher?: RegistryResponseFetcher; timeoutMs?: number } = {}) {
		this.responseFetcher = options.responseFetcher ?? fetchRegistryResponse;
		this.timeoutMs = options.timeoutMs ?? 5000;
	}

	async checkPypi(packageName: string): Promise<RegistryCheckResult> {
		const lookupName = normalizePypiName(packageName);
		const validationError = pypiValidationError(packageName);
		if (validationError !== null) {
			return invalidResult("pypi", {
				inputName: packageName,
				lookupName,
				message: validationError,
			});
		}
		try {
			const response = await this.responseFetcher(pypiProjectJsonUrl(lookupName), this.timeoutMs);
			if (response.statusCode === 200) {
				const metadata = pypiMetadata(lookupName, response.jsonBody ?? null);
				return takenResult("pypi", { inputName: packageName, lookupName, ...metadata });
			}
			if (response.statusCode === 404)
				return availableResult("pypi", { inputName: packageName, lookupName });
			return errorResult("pypi", {
				inputName: packageName,
				lookupName,
				message: `PyPI returned unexpected HTTP status ${response.statusCode}`,
			});
		} catch (error) {
			return errorResult("pypi", {
				inputName: packageName,
				lookupName,
				message: `PyPI lookup failed: ${formatError(error)}`,
			});
		}
	}

	async checkNpm(packageName: string): Promise<RegistryCheckResult> {
		const validationError = npmValidationError(packageName);
		if (validationError !== null) {
			return invalidResult("npm", {
				inputName: packageName,
				lookupName: packageName,
				message: validationError,
			});
		}
		try {
			const response = await this.responseFetcher(npmRegistryUrl(packageName), this.timeoutMs);
			if (response.statusCode === 200) {
				const metadata = npmMetadata(packageName, response.jsonBody ?? null);
				return takenResult("npm", { inputName: packageName, lookupName: packageName, ...metadata });
			}
			if (response.statusCode === 404)
				return availableResult("npm", { inputName: packageName, lookupName: packageName });
			return errorResult("npm", {
				inputName: packageName,
				lookupName: packageName,
				message: `npm returned unexpected HTTP status ${response.statusCode}`,
			});
		} catch (error) {
			return errorResult("npm", {
				inputName: packageName,
				lookupName: packageName,
				message: `npm lookup failed: ${formatError(error)}`,
			});
		}
	}

	async checkBrew(packageName: string): Promise<RegistryCheckResult> {
		const validationError = brewFormulaValidationError(packageName);
		if (validationError !== null) {
			return invalidResult("brew", {
				inputName: packageName,
				lookupName: packageName,
				message: validationError,
			});
		}
		try {
			const response = await this.responseFetcher(brewFormulaJsonUrl(packageName), this.timeoutMs);
			if (response.statusCode === 200) {
				const metadata = brewMetadata(packageName, response.jsonBody ?? null);
				return takenResult("brew", {
					inputName: packageName,
					lookupName: packageName,
					...metadata,
				});
			}
			if (response.statusCode === 404)
				return availableResult("brew", { inputName: packageName, lookupName: packageName });
			return errorResult("brew", {
				inputName: packageName,
				lookupName: packageName,
				message: `Homebrew formula API returned unexpected HTTP status ${response.statusCode}`,
			});
		} catch (error) {
			return errorResult("brew", {
				inputName: packageName,
				lookupName: packageName,
				message: `Homebrew formula lookup failed: ${formatError(error)}`,
			});
		}
	}
}

export class FakePackageRegistryGateway implements PackageRegistryGateway {
	private readonly pypiResults: ReadonlyMap<string, RegistryCheckResult>;
	private readonly npmResults: ReadonlyMap<string, RegistryCheckResult>;
	private readonly brewResults: ReadonlyMap<string, RegistryCheckResult>;
	private readonly pypiLog: string[] = [];
	private readonly npmLog: string[] = [];
	private readonly brewLog: string[] = [];

	constructor(
		options: {
			pypiResults?: ReadonlyMap<string, RegistryCheckResult> | Record<string, RegistryCheckResult>;
			npmResults?: ReadonlyMap<string, RegistryCheckResult> | Record<string, RegistryCheckResult>;
			brewResults?: ReadonlyMap<string, RegistryCheckResult> | Record<string, RegistryCheckResult>;
		} = {},
	) {
		this.pypiResults = toReadonlyMap(options.pypiResults);
		this.npmResults = toReadonlyMap(options.npmResults);
		this.brewResults = toReadonlyMap(options.brewResults);
	}

	get pypiCheckedNames(): string[] {
		return [...this.pypiLog];
	}

	get npmCheckedNames(): string[] {
		return [...this.npmLog];
	}

	get brewCheckedNames(): string[] {
		return [...this.brewLog];
	}

	async checkPypi(packageName: string): Promise<RegistryCheckResult> {
		this.pypiLog.push(packageName);
		return (
			this.pypiResults.get(packageName) ??
			errorResult("pypi", {
				inputName: packageName,
				lookupName: packageName,
				message: `no fake PyPI result configured for '${packageName}'`,
			})
		);
	}

	async checkNpm(packageName: string): Promise<RegistryCheckResult> {
		this.npmLog.push(packageName);
		return (
			this.npmResults.get(packageName) ??
			errorResult("npm", {
				inputName: packageName,
				lookupName: packageName,
				message: `no fake npm result configured for '${packageName}'`,
			})
		);
	}

	async checkBrew(packageName: string): Promise<RegistryCheckResult> {
		this.brewLog.push(packageName);
		return (
			this.brewResults.get(packageName) ??
			errorResult("brew", {
				inputName: packageName,
				lookupName: packageName,
				message: `no fake Homebrew result configured for '${packageName}'`,
			})
		);
	}
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

	buildPackage(projectDir: string): string[] | PypiPublishFailure {
		const distDir = join(projectDir, "dist");
		try {
			if (exists(distDir)) {
				if (!statSync(distDir).isDirectory()) {
					return failure(`Cannot prepare dist directory because it is not a directory: ${distDir}`);
				}
				rmSync(distDir, { recursive: true, force: true });
			}
			const command = ["uv", "build"];
			const result = this.commandRunner(command, projectDir);
			if (result.returnCode !== 0) return failure(formatCommandFailure(command, result));
			if (!exists(distDir)) return failure("uv build did not create a dist/ directory");
			if (!statSync(distDir).isDirectory())
				return failure("uv build created dist, but it is not a directory");
			const artifacts = readdirSync(distDir)
				.map((name) => join(distDir, name))
				.filter((path) => statSync(path).isFile())
				.sort();
			if (artifacts.length === 0) return failure("uv build did not produce any artifacts in dist/");
			return artifacts;
		} catch (error) {
			return failure(`uv build failed to start: ${formatError(error)}`);
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

	buildPackage(projectDir: string): string[] | PypiPublishFailure {
		this.builtDirs.push(projectDir);
		if (this.buildError !== null) return failure(this.buildError);
		return [...this.artifacts];
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

function toReadonlyMap<T>(
	input: ReadonlyMap<string, T> | Record<string, T> | undefined,
): ReadonlyMap<string, T> {
	if (input === undefined) return new Map();
	if (input instanceof Map) return new Map(input);
	return new Map(Object.entries(input));
}

async function fetchRegistryResponse(
	url: string,
	timeoutMs: number,
): Promise<RegistryHttpResponse> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, {
			headers: { Accept: "application/json", "User-Agent": "packagechk/0.1" },
			signal: controller.signal,
		});
		if (response.status === 404) return { statusCode: 404 };
		let jsonBody: Record<string, unknown> | null = null;
		const text = await response.text();
		if (text !== "") {
			try {
				const parsed: unknown = JSON.parse(text);
				if (isRecord(parsed)) jsonBody = parsed;
			} catch {
				jsonBody = null;
			}
		}
		return { statusCode: response.status, jsonBody };
	} finally {
		clearTimeout(timeout);
	}
}

function pypiMetadata(lookupName: string, jsonBody: Record<string, unknown> | null): Metadata {
	const info = isRecord(jsonBody?.["info"]) ? jsonBody["info"] : null;
	return buildMetadata({
		packageUrl: pypiProjectUrl(lookupName),
		latestVersion: stringField(info, "version"),
		description: stringField(info, "summary"),
	});
}

function npmMetadata(packageName: string, jsonBody: Record<string, unknown> | null): Metadata {
	const distTags = isRecord(jsonBody?.["dist-tags"]) ? jsonBody["dist-tags"] : null;
	return buildMetadata({
		packageUrl: npmPackagePageUrl(packageName),
		latestVersion: stringField(distTags, "latest"),
		description: stringField(jsonBody, "description"),
	});
}

function brewMetadata(formulaName: string, jsonBody: Record<string, unknown> | null): Metadata {
	const versions = isRecord(jsonBody?.versions) ? jsonBody.versions : null;
	return buildMetadata({
		packageUrl: brewFormulaPageUrl(formulaName),
		latestVersion: stringField(versions, "stable"),
		description: stringField(jsonBody, "desc"),
	});
}

interface Metadata {
	packageUrl: string;
	latestVersion?: string;
	description?: string;
}

function buildMetadata(options: {
	packageUrl: string;
	latestVersion: string | undefined;
	description: string | undefined;
}): Metadata {
	return {
		packageUrl: options.packageUrl,
		...(options.latestVersion === undefined ? {} : { latestVersion: options.latestVersion }),
		...(options.description === undefined ? {} : { description: options.description }),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(fields: Record<string, unknown> | null, key: string): string | undefined {
	const value = fields?.[key];
	return typeof value === "string" && value !== "" ? value : undefined;
}

function pypiProjectJsonUrl(normalizedName: string): string {
	return `https://pypi.org/pypi/${encodeURIComponent(normalizedName)}/json`;
}

function pypiProjectUrl(normalizedName: string): string {
	return `https://pypi.org/project/${encodeURIComponent(normalizedName)}/`;
}

function npmRegistryUrl(packageName: string): string {
	return `https://registry.npmjs.org/${encodeURIComponent(packageName).replaceAll("%40", "@")}`;
}

function npmPackagePageUrl(packageName: string): string {
	return `https://www.npmjs.com/package/${encodeURIComponent(packageName).replaceAll("%40", "@").replaceAll("%2F", "/")}`;
}

function brewFormulaJsonUrl(formulaName: string): string {
	return `https://formulae.brew.sh/api/formula/${encodeURIComponent(formulaName)}.json`;
}

function brewFormulaPageUrl(formulaName: string): string {
	return `https://formulae.brew.sh/formula/${encodeURIComponent(formulaName)}`;
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

function failure(message: string): PypiPublishFailure {
	return { type: "pypi_publish_failure", message };
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function exists(path: string): boolean {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}

export function packageDirectory(): string {
	return dirname(fileURLToPath(import.meta.url));
}
