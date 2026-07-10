import {
	npmPackageRoot,
	parseExtensionSourceSpec,
	resolveDeclaredExtensionModules,
	type ExtensionAcquisitionDiagnostic,
	type ExtensionAcquisitionGateway,
} from "@nseng-ai/kernel/extensions/acquisition";

export interface EnsureExtensionSourceParams {
	readonly repoRoot: string;
	readonly sourceSpec: string;
}

export type EnsureExtensionSourceResult =
	| {
			readonly ok: true;
			readonly sourceKind: "local" | "npm";
			readonly moduleRoot: string;
	  }
	| {
			readonly ok: false;
			readonly diagnostics: readonly ExtensionAcquisitionDiagnostic[];
	  };

/** Consumer Gateway for placing one install source where descriptor activation can load it. */
export interface ExtensionInstallAcquisitionGateway {
	ensure(params: EnsureExtensionSourceParams): Promise<EnsureExtensionSourceResult>;
}

export class RealExtensionInstallAcquisitionGateway implements ExtensionInstallAcquisitionGateway {
	private readonly acquisition: ExtensionAcquisitionGateway;

	constructor(acquisition: ExtensionAcquisitionGateway) {
		this.acquisition = acquisition;
	}

	async ensure(params: EnsureExtensionSourceParams): Promise<EnsureExtensionSourceResult> {
		const result = await resolveDeclaredExtensionModules({
			projectRoot: params.repoRoot,
			declaredSpecs: [params.sourceSpec],
			mode: "apply",
			npmAcquisition: "ensure",
			gateway: this.acquisition,
		});
		const root = result.roots.find((candidate) => candidate.spec === params.sourceSpec);
		if (root === undefined || result.diagnostics.length > 0) {
			return { ok: false, diagnostics: result.diagnostics };
		}
		return { ok: true, sourceKind: root.sourceKind, moduleRoot: root.moduleRoot };
	}
}

export interface InMemoryExtensionInstallAcquisitionState {
	readonly installedPackageRoots?: readonly string[];
	readonly failureBySpec?: Readonly<Record<string, ExtensionAcquisitionDiagnostic>>;
}

export class InMemoryExtensionInstallAcquisitionGateway implements ExtensionInstallAcquisitionGateway {
	private readonly installedPackageRoots: Set<string>;
	private readonly failureBySpec: Readonly<Record<string, ExtensionAcquisitionDiagnostic>>;
	private readonly ensureLog: EnsureExtensionSourceParams[] = [];

	constructor(state: InMemoryExtensionInstallAcquisitionState = {}) {
		this.installedPackageRoots = new Set(state.installedPackageRoots ?? []);
		this.failureBySpec = structuredClone(state.failureBySpec ?? {});
	}

	async ensure(params: EnsureExtensionSourceParams): Promise<EnsureExtensionSourceResult> {
		this.ensureLog.push({ ...params });
		const failure = this.failureBySpec[params.sourceSpec];
		if (failure !== undefined) return { ok: false, diagnostics: [{ ...failure }] };
		const parsed = parseExtensionSourceSpec(params.repoRoot, params.sourceSpec);
		if (!parsed.ok) return { ok: false, diagnostics: [{ ...parsed.error }] };
		if (parsed.value.kind === "git") {
			return {
				ok: false,
				diagnostics: [
					{
						code: "extension_acquisition_git_unsupported",
						message: `Git extension sources are unsupported: ${params.sourceSpec}.`,
						spec: params.sourceSpec,
					},
				],
			};
		}
		if (parsed.value.kind === "local") {
			return { ok: true, sourceKind: "local", moduleRoot: parsed.value.path };
		}
		const moduleRoot = npmPackageRoot(params.repoRoot, parsed.value.packageName);
		this.installedPackageRoots.add(moduleRoot);
		return { ok: true, sourceKind: "npm", moduleRoot };
	}

	installedRoots(): ReadonlySet<string> {
		return new Set(this.installedPackageRoots);
	}

	calls(): readonly EnsureExtensionSourceParams[] {
		return this.ensureLog.map((call) => ({ ...call }));
	}
}
