import { z } from "zod";

export const productionDeploymentResultSchema = z.strictObject({
	status: z.literal("ok"),
	deploymentId: z.string().min(1),
	deploymentUrl: z.url(),
	productionAlias: z.url(),
	gitCommitSha: z.string().regex(/^[0-9a-f]{40}$/u),
	projectId: z.string().min(1),
	artifactDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
});

export type ProductionDeploymentResult = z.infer<typeof productionDeploymentResultSchema>;

export type ProductionDeploymentFailureCode =
	| "dirty-repository"
	| "source-build-failed"
	| "project-identity-mismatch"
	| "invalid-artifact"
	| "promotion-failed"
	| "deploy-failed"
	| "ambiguous-upload"
	| "deployment-inspection-failed"
	| "alias-mismatch";

export type ProductionDeploymentOutcome =
	| { readonly ok: true; readonly value: ProductionDeploymentResult }
	| {
			readonly ok: false;
			readonly code: ProductionDeploymentFailureCode;
			readonly message: string;
	  };

export interface DispatchProjectIdentity {
	readonly projectId: string;
	readonly teamId: string;
	readonly projectName: string;
}

export interface DispatchProductionConfiguration {
	readonly packageProject: DispatchProjectIdentity;
	readonly repositoryProject: DispatchProjectIdentity;
	readonly configuredProjectId: string;
	readonly configuredTeamId: string;
	readonly productionAlias: string;
}

export interface ProductionRepositoryGateway {
	inspectProductionSource(): Promise<
		| { readonly ok: true; readonly commitSha: string }
		| { readonly ok: false; readonly dirtyPaths: readonly string[]; readonly message: string }
	>;
}

export interface PreparedProductionSourceWorkspace {
	buildPackageDeployable(): Promise<
		{ readonly ok: true } | { readonly ok: false; readonly message: string }
	>;
	verifySourceAfterBuild(): Promise<
		{ readonly ok: true } | { readonly ok: false; readonly message: string }
	>;
	readPackageProjectIdentity(): Promise<
		| { readonly ok: true; readonly value: DispatchProjectIdentity }
		| { readonly ok: false; readonly message: string }
	>;
	promoteVerifiedBuildOutput(): Promise<
		| { readonly ok: true; readonly artifactDigest: string }
		| {
				readonly ok: false;
				readonly phase: "verification" | "promotion";
				readonly message: string;
		  }
	>;
	dispose(): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
}

export interface ProductionSourceWorkspaceGateway {
	prepareSourceWorkspace(
		commitSha: string,
	): Promise<
		| { readonly ok: true; readonly workspace: PreparedProductionSourceWorkspace }
		| { readonly ok: false; readonly message: string }
	>;
}

export interface DispatchProductionConfigurationGateway {
	readProductionConfiguration(
		commitSha: string,
		packageProject: DispatchProjectIdentity,
	): Promise<
		| { readonly ok: true; readonly value: DispatchProductionConfiguration }
		| { readonly ok: false; readonly message: string }
	>;
}

export interface VercelDeploymentLocator {
	readonly deploymentId?: string;
	readonly deploymentUrl?: string;
}

export interface VercelDeploymentRecord {
	readonly deploymentId: string;
	readonly deploymentUrl: string;
	readonly status: "ready" | "not-ready";
}

export interface VercelProductionDeploymentGateway {
	deployPrebuiltProduction(): Promise<
		| { readonly ok: true; readonly locator: VercelDeploymentLocator }
		| {
				readonly ok: false;
				readonly message: string;
				readonly locator?: VercelDeploymentLocator;
		  }
	>;
	inspectDeployment(
		locator: VercelDeploymentLocator | string,
		teamId: string,
	): Promise<
		| { readonly ok: true; readonly value: VercelDeploymentRecord }
		| { readonly ok: false; readonly message: string }
	>;
}

export interface ProductionDeploymentContext {
	readonly repository: ProductionRepositoryGateway;
	readonly sourceWorkspaces: ProductionSourceWorkspaceGateway;
	readonly configuration: DispatchProductionConfigurationGateway;
	readonly deployments: VercelProductionDeploymentGateway;
	readonly progress: (message: string) => void;
}

export async function deployDispatchProduction(
	context: ProductionDeploymentContext,
): Promise<ProductionDeploymentOutcome> {
	context.progress("Checking production source state.");
	const source = await context.repository.inspectProductionSource();
	if (source.ok === false) return failure("dirty-repository", source.message);

	context.progress("Preparing detached production source workspace.");
	const prepared = await context.sourceWorkspaces.prepareSourceWorkspace(source.commitSha);
	if (prepared.ok === false) return failure("source-build-failed", prepared.message);
	const workspace = prepared.workspace;

	context.progress("Building package deployable from captured source.");
	const build = await workspace.buildPackageDeployable();
	if (build.ok === false) {
		return await failAndDispose(workspace, failure("source-build-failed", build.message));
	}

	context.progress("Revalidating detached production source.");
	const revalidated = await workspace.verifySourceAfterBuild();
	if (revalidated.ok === false) {
		return await failAndDispose(workspace, failure("source-build-failed", revalidated.message));
	}

	context.progress("Validating dispatch project identity.");
	const packageProject = await workspace.readPackageProjectIdentity();
	if (packageProject.ok === false) {
		return await failAndDispose(
			workspace,
			failure("project-identity-mismatch", packageProject.message),
		);
	}
	const configuration = await context.configuration.readProductionConfiguration(
		source.commitSha,
		packageProject.value,
	);
	if (configuration.ok === false) {
		return await failAndDispose(
			workspace,
			failure("project-identity-mismatch", configuration.message),
		);
	}
	const identityProblem = findIdentityProblem(configuration.value);
	if (identityProblem !== undefined) {
		return await failAndDispose(workspace, failure("project-identity-mismatch", identityProblem));
	}

	context.progress("Transactionally promoting verified Build Output.");
	const promotion = await workspace.promoteVerifiedBuildOutput();
	if (promotion.ok === false) {
		return await failAndDispose(
			workspace,
			failure(
				promotion.phase === "verification" ? "invalid-artifact" : "promotion-failed",
				promotion.message,
			),
		);
	}

	context.progress("Cleaning detached production source workspace.");
	const disposed = await workspace.dispose();
	if (disposed.ok === false) return failure("source-build-failed", disposed.message);

	context.progress("Deploying prebuilt output to Vercel production.");
	const deployed = await context.deployments.deployPrebuiltProduction();
	if (deployed.ok === false && deployed.locator === undefined) {
		return failure("deploy-failed", deployed.message);
	}
	const locator = deployed.locator;
	if (locator === undefined) return failure("ambiguous-upload", "Deployment returned no locator.");

	context.progress("Inspecting immutable deployment identity.");
	const immutable = await context.deployments.inspectDeployment(
		locator,
		configuration.value.configuredTeamId,
	);
	if (immutable.ok === false) {
		return failure(
			deployed.ok ? "deployment-inspection-failed" : "ambiguous-upload",
			immutable.message,
		);
	}
	if (immutable.value.status !== "ready") {
		return failure("deployment-inspection-failed", "The uploaded deployment is not Ready.");
	}

	context.progress("Verifying production alias identity.");
	const alias = await context.deployments.inspectDeployment(
		configuration.value.productionAlias,
		configuration.value.configuredTeamId,
	);
	if (alias.ok === false) return failure("deployment-inspection-failed", alias.message);
	if (alias.value.deploymentId !== immutable.value.deploymentId) {
		return failure("alias-mismatch", "The production alias identifies a different deployment.");
	}

	return {
		ok: true,
		value: productionDeploymentResultSchema.parse({
			status: "ok",
			deploymentId: immutable.value.deploymentId,
			deploymentUrl: immutable.value.deploymentUrl,
			productionAlias: configuration.value.productionAlias,
			gitCommitSha: source.commitSha,
			projectId: configuration.value.configuredProjectId,
			artifactDigest: promotion.artifactDigest,
		}),
	};
}

async function failAndDispose(
	workspace: PreparedProductionSourceWorkspace,
	outcome: ProductionDeploymentOutcome,
): Promise<ProductionDeploymentOutcome> {
	const disposed = await workspace.dispose();
	if (disposed.ok || outcome.ok) return outcome;
	return failure(outcome.code, `${outcome.message} Cleanup also failed: ${disposed.message}`);
}

function findIdentityProblem(configuration: DispatchProductionConfiguration): string | undefined {
	const { packageProject, repositoryProject } = configuration;
	if (
		packageProject.projectId !== repositoryProject.projectId ||
		packageProject.teamId !== repositoryProject.teamId ||
		packageProject.projectName !== repositoryProject.projectName
	) {
		return "Package and repository Vercel project metadata disagree.";
	}
	if (
		packageProject.projectId !== configuration.configuredProjectId ||
		packageProject.teamId !== configuration.configuredTeamId
	) {
		return "Vercel project metadata and ns.toml dispatch identity disagree.";
	}
	return undefined;
}

function failure(
	code: ProductionDeploymentFailureCode,
	message: string,
): ProductionDeploymentOutcome {
	return { ok: false, code, message };
}
