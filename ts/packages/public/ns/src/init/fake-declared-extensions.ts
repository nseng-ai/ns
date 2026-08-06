import type { LoadDeclaredExtensionDescriptorsResult } from "@nseng-ai/sdk/extensions/declared-descriptors";
import type { UserExtensionPackageAvailabilityFact } from "@nseng-ai/sdk/extensions/user-package-availability";

import type {
	DeclaredExtensionsGateway,
	LoadDeclaredExtensionsParams,
	UserExtensionAvailabilityGateway,
} from "./declared-extensions.ts";

export interface InMemoryDeclaredExtensionsState {
	readonly result?: LoadDeclaredExtensionDescriptorsResult;
}

export class InMemoryDeclaredExtensionsGateway implements DeclaredExtensionsGateway {
	private readonly result: LoadDeclaredExtensionDescriptorsResult;
	private readonly loadLog: LoadDeclaredExtensionsParams[] = [];

	constructor(state: InMemoryDeclaredExtensionsState = {}) {
		this.result = copyLoadResult(state.result ?? { descriptors: [], diagnostics: [] });
	}

	async load(
		params: LoadDeclaredExtensionsParams,
	): Promise<LoadDeclaredExtensionDescriptorsResult> {
		this.loadLog.push({ repoRoot: params.repoRoot, specs: [...params.specs] });
		return copyLoadResult(this.result);
	}

	calls(): readonly LoadDeclaredExtensionsParams[] {
		return this.loadLog.map((call) => ({ repoRoot: call.repoRoot, specs: [...call.specs] }));
	}
}

export interface InMemoryUserExtensionAvailabilityState {
	readonly facts?: readonly UserExtensionPackageAvailabilityFact[];
}

export class InMemoryUserExtensionAvailabilityGateway implements UserExtensionAvailabilityGateway {
	private readonly facts: readonly UserExtensionPackageAvailabilityFact[];
	private readonly evaluateLog: Array<Parameters<UserExtensionAvailabilityGateway["evaluate"]>[0]> =
		[];

	constructor(state: InMemoryUserExtensionAvailabilityState = {}) {
		this.facts = structuredClone(state.facts ?? []);
	}

	async evaluate(
		params: Parameters<UserExtensionAvailabilityGateway["evaluate"]>[0],
	): Promise<readonly UserExtensionPackageAvailabilityFact[]> {
		this.evaluateLog.push({
			configDir: params.configDir,
			sourceSpecs: [...params.sourceSpecs],
			...(params.npmPackageRootOverride === undefined
				? {}
				: { npmPackageRootOverride: { ...params.npmPackageRootOverride } }),
		});
		return params.sourceSpecs.map((sourceSpec) =>
			structuredClone(
				this.facts.find((fact) => fact.sourceSpec === sourceSpec) ?? {
					sourceSpec,
					availability: "unavailable" as const,
					diagnostics: [],
				},
			),
		);
	}

	calls(): readonly Parameters<UserExtensionAvailabilityGateway["evaluate"]>[0][] {
		return structuredClone(this.evaluateLog);
	}
}

function copyLoadResult(
	result: LoadDeclaredExtensionDescriptorsResult,
): LoadDeclaredExtensionDescriptorsResult {
	return structuredClone(result);
}
