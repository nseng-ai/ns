import { formatErrorMessage, isRecord } from "@nseng-ai/core/primitives";
import type { TimerScheduler } from "@nseng-ai/core/timers";
import { systemTimerScheduler } from "@nseng-ai/core/time";

import {
	availableResult,
	errorResult,
	invalidResult,
	registryCheckMetadataFields,
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
	timers?: TimerScheduler,
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

interface RunRegistryCheckOptions {
	config: RegistryCheckConfig;
	packageName: string;
	responseFetcher: RegistryResponseFetcher;
	timeoutMs: number;
	timers: TimerScheduler;
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
	private readonly timers: TimerScheduler;

	constructor(
		options: {
			responseFetcher?: RegistryResponseFetcher;
			timeoutMs?: number;
			timers?: TimerScheduler;
		} = {},
	) {
		this.responseFetcher = options.responseFetcher ?? fetchRegistryResponse;
		this.timeoutMs = options.timeoutMs ?? 5000;
		this.timers = options.timers ?? systemTimerScheduler;
	}

	async check(registry: Registry, packageName: string): Promise<RegistryCheckResult> {
		return await runRegistryCheck({
			config: REGISTRY_CHECKS[registry],
			packageName,
			responseFetcher: this.responseFetcher,
			timeoutMs: this.timeoutMs,
			timers: this.timers,
		});
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

async function runRegistryCheck(options: RunRegistryCheckOptions): Promise<RegistryCheckResult> {
	const { config, packageName, responseFetcher, timeoutMs, timers } = options;
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
		const response = await responseFetcher(config.url(lookupName), timeoutMs, timers);
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
	timers: TimerScheduler = systemTimerScheduler,
): Promise<RegistryHttpResponse> {
	const controller = new AbortController();
	const timeout = timers.setTimeout(() => controller.abort(), timeoutMs);
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
		timeout.cancel();
	}
}

function pypiMetadata(lookupName: string, jsonBody: Record<string, unknown> | null): Metadata {
	const info = isRecord(jsonBody?.["info"]) ? jsonBody["info"] : null;
	const latestVersion = stringField(info, "version");
	const description = stringField(info, "summary");
	return buildMetadata({
		packageUrl: pypiProjectUrl(lookupName),
		...(latestVersion === undefined ? {} : { latestVersion }),
		...(description === undefined ? {} : { description }),
	});
}

function npmMetadata(packageName: string, jsonBody: Record<string, unknown> | null): Metadata {
	const distTags = isRecord(jsonBody?.["dist-tags"]) ? jsonBody["dist-tags"] : null;
	const latestVersion = stringField(distTags, "latest");
	const description = stringField(jsonBody, "description");
	return buildMetadata({
		packageUrl: npmPackagePageUrl(packageName),
		...(latestVersion === undefined ? {} : { latestVersion }),
		...(description === undefined ? {} : { description }),
	});
}

function brewMetadata(formulaName: string, jsonBody: Record<string, unknown> | null): Metadata {
	const versions = isRecord(jsonBody?.versions) ? jsonBody.versions : null;
	const latestVersion = stringField(versions, "stable");
	const description = stringField(jsonBody, "desc");
	return buildMetadata({
		packageUrl: brewFormulaPageUrl(formulaName),
		...(latestVersion === undefined ? {} : { latestVersion }),
		...(description === undefined ? {} : { description }),
	});
}

function buildMetadata(options: {
	packageUrl: string;
	latestVersion?: string;
	description?: string;
}): Metadata {
	return {
		packageUrl: options.packageUrl,
		...registryCheckMetadataFields(options),
	};
}

function stringField(fields: Record<string, unknown> | null, key: string): string | undefined {
	const value = fields?.[key];
	return typeof value === "string" && value !== "" ? value : undefined;
}
