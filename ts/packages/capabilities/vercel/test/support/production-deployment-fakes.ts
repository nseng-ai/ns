import type {
	DispatchProductionConfiguration,
	ProductionDeploymentContext,
	VercelDeploymentLocator,
	VercelDeploymentRecord,
} from "../../src/deployability/production-deployment.ts";

interface ProductionFakeState {
	readonly isDirty?: boolean;
	readonly preparationFails?: boolean;
	readonly buildFails?: boolean;
	readonly sourceRevalidationFails?: "head" | "dirty";
	readonly cleanupFails?: boolean;
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
	readonly operations: readonly string[];
	readonly state: {
		readonly preparedCommitSha: string | undefined;
		readonly configurationCommitSha: string | undefined;
		readonly inspectedTeamIds: readonly string[];
		readonly isPromoted: boolean;
		readonly isDisposed: boolean;
		readonly isDeployed: boolean;
		readonly isOldOutputPresent: boolean;
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
	const operations: string[] = [];
	let preparedCommitSha: string | undefined;
	let configurationCommitSha: string | undefined;
	const inspectedTeamIds: string[] = [];
	let isPromoted = false;
	let isDisposed = false;
	let isDeployed = false;
	let isOldOutputPresent = true;
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
				operations.push("inspect-source");
				return initial.isDirty
					? { ok: false, dirtyPaths: ["dirty.ts"], message: "Repository is dirty." }
					: { ok: true, commitSha: "a".repeat(40) };
			},
		},
		sourceWorkspaces: {
			async prepareSourceWorkspace(commitSha) {
				preparedCommitSha = commitSha;
				operations.push("prepare-workspace");
				if (initial.preparationFails) {
					operations.push("cleanup-partial-workspace");
					return { ok: false, message: "Preparation failed." };
				}
				return {
					ok: true,
					workspace: {
						async buildPackageDeployable() {
							operations.push("build-workspace");
							return initial.buildFails ? { ok: false, message: "Build failed." } : { ok: true };
						},
						async verifySourceAfterBuild() {
							operations.push("revalidate-workspace");
							return initial.sourceRevalidationFails === undefined
								? { ok: true }
								: {
										ok: false,
										message:
											initial.sourceRevalidationFails === "head"
												? "Detached source HEAD changed during build."
												: "Detached source changed during build.",
									};
						},
						async readPackageProjectIdentity() {
							operations.push("read-workspace-project-identity");
							return { ok: true, value: initial.configuration?.packageProject ?? identity };
						},
						async promoteVerifiedBuildOutput() {
							operations.push("promote-workspace-output");
							if (initial.promotionFailure !== undefined) {
								return {
									ok: false,
									phase:
										initial.promotionFailure === "verification"
											? ("verification" as const)
											: ("promotion" as const),
									message: "Promotion failed.",
								};
							}
							isPromoted = true;
							isOldOutputPresent = false;
							destinationFiles = ["current-artifact"];
							return { ok: true, artifactDigest: `sha256:${"b".repeat(64)}` };
						},
						async dispose() {
							operations.push("dispose-workspace");
							if (initial.cleanupFails) {
								return { ok: false, message: "Workspace cleanup failed." };
							}
							isDisposed = true;
							return { ok: true };
						},
					},
				};
			},
		},
		configuration: {
			async readProductionConfiguration(commitSha) {
				configurationCommitSha = commitSha;
				operations.push("read-configuration");
				return initial.configurationFails
					? { ok: false, message: "Configuration failed." }
					: { ok: true, value: initial.configuration ?? defaultConfiguration };
			},
		},
		deployments: {
			async deployPrebuiltProduction() {
				operations.push("deploy");
				isDeployed = true;
				if (initial.deployFailure === "definite") return { ok: false, message: "Deploy failed." };
				const locator: VercelDeploymentLocator = { deploymentId: deployment.deploymentId };
				return initial.deployFailure === "ambiguous"
					? { ok: false, message: "Transport failed.", locator }
					: { ok: true, locator };
			},
			async inspectDeployment(locator, teamId) {
				inspectedTeamIds.push(teamId);
				operations.push(typeof locator === "string" ? "inspect-alias" : "inspect-deployment");
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
		operations,
		state: {
			get preparedCommitSha() {
				return preparedCommitSha;
			},
			get configurationCommitSha() {
				return configurationCommitSha;
			},
			get inspectedTeamIds() {
				return [...inspectedTeamIds];
			},
			get isPromoted() {
				return isPromoted;
			},
			get isDisposed() {
				return isDisposed;
			},
			get isDeployed() {
				return isDeployed;
			},
			get isOldOutputPresent() {
				return isOldOutputPresent;
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
