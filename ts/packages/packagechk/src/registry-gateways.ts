import {
	availableResult,
	errorResult,
	invalidResult,
	takenResult,
	type RegistryCheckResult,
} from "./models.ts";
import {
	brewFormulaJsonUrl,
	brewFormulaPageUrl,
	npmPackagePageUrl,
	npmRegistryUrl,
	pypiProjectJsonUrl,
	pypiProjectUrl,
} from "./urls.ts";
import {
	brewFormulaValidationError,
	normalizePypiName,
	npmValidationError,
	pypiValidationError,
} from "./validation.ts";
import { formatError } from "./error-format.ts";

export interface PackageRegistryGateway {
	checkPypi(packageName: string): Promise<RegistryCheckResult>;
	checkNpm(packageName: string): Promise<RegistryCheckResult>;
	checkBrew(packageName: string): Promise<RegistryCheckResult>;
}

export interface RegistryHttpResponse {
	statusCode: number;
	jsonBody: Record<string, unknown> | null;
}

export type RegistryResponseFetcher = (
	url: string,
	timeoutMs: number,
) => Promise<RegistryHttpResponse>;

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
				const metadata = pypiMetadata(lookupName, response.jsonBody);
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
				const metadata = npmMetadata(packageName, response.jsonBody);
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
				const metadata = brewMetadata(packageName, response.jsonBody);
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
		if (response.status === 404) return { statusCode: 404, jsonBody: null };
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
