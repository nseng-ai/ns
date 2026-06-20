import { formatErrorMessage, isRecord } from "@asdl/core/primitives";

import {
	availableResult,
	errorResult,
	invalidResult,
	takenResult,
	type Registry,
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

export interface PackageRegistryGateway {
	check(registry: Registry, packageName: string): Promise<RegistryCheckResult>;
}

export interface RegistryHttpResponse {
	statusCode: number;
	jsonBody: Record<string, unknown> | null;
}

export type RegistryResponseFetcher = (
	url: string,
	timeoutMs: number,
) => Promise<RegistryHttpResponse>;

interface Metadata {
	packageUrl: string;
	latestVersion?: string;
	description?: string;
}

interface RegistryCheckConfig {
	registry: Registry;
	lookupName(packageName: string): string;
	validate(packageName: string): string | null;
	url(lookupName: string): string;
	metadata(lookupName: string, jsonBody: Record<string, unknown> | null): Metadata;
	unexpectedStatusMessage(statusCode: number): string;
	lookupFailedMessage(error: unknown): string;
}

const PYPI_REGISTRY_CHECK = {
	registry: "pypi",
	lookupName: normalizePypiName,
	validate: pypiValidationError,
	url: pypiProjectJsonUrl,
	metadata: pypiMetadata,
	unexpectedStatusMessage: (statusCode) => `PyPI returned unexpected HTTP status ${statusCode}`,
	lookupFailedMessage: (error) => `PyPI lookup failed: ${formatErrorMessage(error)}`,
} as const satisfies RegistryCheckConfig;

const NPM_REGISTRY_CHECK = {
	registry: "npm",
	lookupName: (packageName) => packageName,
	validate: npmValidationError,
	url: npmRegistryUrl,
	metadata: npmMetadata,
	unexpectedStatusMessage: (statusCode) => `npm returned unexpected HTTP status ${statusCode}`,
	lookupFailedMessage: (error) => `npm lookup failed: ${formatErrorMessage(error)}`,
} as const satisfies RegistryCheckConfig;

const BREW_REGISTRY_CHECK = {
	registry: "brew",
	lookupName: (packageName) => packageName,
	validate: brewFormulaValidationError,
	url: brewFormulaJsonUrl,
	metadata: brewMetadata,
	unexpectedStatusMessage: (statusCode) =>
		`Homebrew formula API returned unexpected HTTP status ${statusCode}`,
	lookupFailedMessage: (error) => `Homebrew formula lookup failed: ${formatErrorMessage(error)}`,
} as const satisfies RegistryCheckConfig;

const REGISTRY_CHECKS = {
	pypi: PYPI_REGISTRY_CHECK,
	npm: NPM_REGISTRY_CHECK,
	brew: BREW_REGISTRY_CHECK,
} as const satisfies Record<Registry, RegistryCheckConfig>;

const REGISTRY_LABELS = {
	pypi: "PyPI",
	npm: "npm",
	brew: "Homebrew",
} as const satisfies Record<Registry, string>;

export class RealPackageRegistryGateway implements PackageRegistryGateway {
	private readonly responseFetcher: RegistryResponseFetcher;
	private readonly timeoutMs: number;

	constructor(options: { responseFetcher?: RegistryResponseFetcher; timeoutMs?: number } = {}) {
		this.responseFetcher = options.responseFetcher ?? fetchRegistryResponse;
		this.timeoutMs = options.timeoutMs ?? 5000;
	}

	async check(registry: Registry, packageName: string): Promise<RegistryCheckResult> {
		return await runRegistryCheck(
			REGISTRY_CHECKS[registry],
			packageName,
			this.responseFetcher,
			this.timeoutMs,
		);
	}
}

export class FakePackageRegistryGateway implements PackageRegistryGateway {
	private readonly results: ReadonlyMap<string, RegistryCheckResult>;
	private readonly log: Array<{ registry: Registry; name: string }> = [];

	constructor(
		options: {
			results?: ReadonlyMap<string, RegistryCheckResult> | Record<string, RegistryCheckResult>;
		} = {},
	) {
		this.results = toReadonlyMap(options.results);
	}

	checkedNames(registry: Registry): string[] {
		return this.log.filter((entry) => entry.registry === registry).map((entry) => entry.name);
	}

	async check(registry: Registry, packageName: string): Promise<RegistryCheckResult> {
		this.log.push({ registry, name: packageName });
		return (
			this.results.get(fakeResultKey(registry, packageName)) ??
			errorResult(registry, {
				inputName: packageName,
				lookupName: packageName,
				message: `no fake ${REGISTRY_LABELS[registry]} result configured for '${packageName}'`,
			})
		);
	}
}

function fakeResultKey(registry: Registry, packageName: string): string {
	return `${registry}:${packageName}`;
}

async function runRegistryCheck(
	config: RegistryCheckConfig,
	packageName: string,
	responseFetcher: RegistryResponseFetcher,
	timeoutMs: number,
): Promise<RegistryCheckResult> {
	const lookupName = config.lookupName(packageName);
	const validationError = config.validate(packageName);
	if (validationError !== null) {
		return invalidResult(config.registry, {
			inputName: packageName,
			lookupName,
			message: validationError,
		});
	}
	try {
		const response = await responseFetcher(config.url(lookupName), timeoutMs);
		if (response.statusCode === 200) {
			const metadata = config.metadata(lookupName, response.jsonBody);
			return takenResult(config.registry, { inputName: packageName, lookupName, ...metadata });
		}
		if (response.statusCode === 404) {
			return availableResult(config.registry, { inputName: packageName, lookupName });
		}
		return errorResult(config.registry, {
			inputName: packageName,
			lookupName,
			message: config.unexpectedStatusMessage(response.statusCode),
		});
	} catch (error) {
		return errorResult(config.registry, {
			inputName: packageName,
			lookupName,
			message: config.lookupFailedMessage(error),
		});
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
				// Registry status still determines availability; malformed metadata only omits optional fields.
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

function stringField(fields: Record<string, unknown> | null, key: string): string | undefined {
	const value = fields?.[key];
	return typeof value === "string" && value !== "" ? value : undefined;
}
