import type {
	DispatchProductionConfiguration,
	ProductionDeploymentContext,
	VercelDeploymentLocator,
	VercelDeploymentRecord,
} from "../../src/deployability/production-deployment.ts";

interface ProductionFakeState {
	readonly isDirty?: boolean;
	readonly buildFails?: boolean;
	readonly configuration?: DispatchProductionConfiguration;
	readonly configurationFails?: boolean;
	readonly promotionFailure?: "verification" | "copy" | "install";
	readonly staleDestinationFile?: string;
	readonly deployFailure?: "definite" | "ambiguous";
	readonly deploymentInspectionFails?: boolean;
	readonly aliasDeploymentId?: string;
}

export interface ProductionFakeHarness {
	readonly context: ProductionDeploymentContext;
	readonly phases: readonly string[];
	readonly state: {
		readonly promoted: boolean;
		readonly oldOutputPresent: boolean;
		readonly destinationFiles: readonly string[];
	};
}

const identity = { projectId: "prj_example", teamId: "team_example", projectName: "ns-dispatch" };
const defaultConfiguration: DispatchProductionConfiguration = {
	packageProject: identity,
	repositoryProject: identity,
	configuredProjectId: identity.projectId,
	configuredTeamId: identity.teamId,
	productionAlias: "https://ns-dispatch.vercel.app",
};

export function createProductionDeploymentFake(
	initial: ProductionFakeState = {},
): ProductionFakeHarness {
	const phases: string[] = [];
	let promoted = false;
	let oldOutputPresent = true;
	let destinationFiles = [
		"current-artifact",
		...(initial.staleDestinationFile === undefined ? [] : [initial.staleDestinationFile]),
	];
	const deployment: VercelDeploymentRecord = {
		deploymentId: "dpl_example",
		deploymentUrl: "https://deployment.vercel.app",
		status: "ready",
	};
	const context: ProductionDeploymentContext = {
		progress: (message) => phases.push(message),
		repository: {
			async inspectProductionSource() {
				return initial.isDirty
					? { ok: false, dirtyPaths: ["dirty.ts"], message: "Repository is dirty." }
					: { ok: true, commitSha: "a".repeat(40) };
			},
		},
		build: {
			async buildPackageDeployable() {
				return initial.buildFails ? { ok: false, message: "Build failed." } : { ok: true };
			},
		},
		configuration: {
			async readProductionConfiguration() {
				return initial.configurationFails
					? { ok: false, message: "Configuration failed." }
					: { ok: true, value: initial.configuration ?? defaultConfiguration };
			},
		},
		artifacts: {
			async promoteVerifiedBuildOutput() {
				if (initial.promotionFailure !== undefined) {
					return {
						ok: false,
						phase: initial.promotionFailure === "verification" ? "verification" : "promotion",
						message: "Promotion failed.",
					};
				}
				promoted = true;
				oldOutputPresent = false;
				destinationFiles = ["current-artifact"];
				return { ok: true, artifactDigest: `sha256:${"b".repeat(64)}` };
			},
		},
		deployments: {
			async deployPrebuiltProduction() {
				if (initial.deployFailure === "definite") return { ok: false, message: "Deploy failed." };
				const locator: VercelDeploymentLocator = { deploymentId: deployment.deploymentId };
				return initial.deployFailure === "ambiguous"
					? { ok: false, message: "Transport failed.", locator }
					: { ok: true, locator };
			},
			async inspectDeployment(locator) {
				if (initial.deploymentInspectionFails) return { ok: false, message: "Inspect failed." };
				if (typeof locator === "string") {
					return {
						ok: true,
						value: {
							...deployment,
							deploymentId: initial.aliasDeploymentId ?? deployment.deploymentId,
						},
					};
				}
				return { ok: true, value: deployment };
			},
		},
	};
	return {
		context,
		phases,
		state: {
			get promoted() {
				return promoted;
			},
			get oldOutputPresent() {
				return oldOutputPresent;
			},
			get destinationFiles() {
				return [...destinationFiles];
			},
		},
	};
}

export function productionConfiguration(
	overrides: Partial<DispatchProductionConfiguration> = {},
): DispatchProductionConfiguration {
	return { ...defaultConfiguration, ...overrides };
}
