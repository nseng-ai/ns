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

export interface DeployableBuildGateway {
	buildPackageDeployable(): Promise<
		{ readonly ok: true } | { readonly ok: false; readonly message: string }
	>;
}

export interface DispatchProductionConfigurationGateway {
	readProductionConfiguration(): Promise<
		| { readonly ok: true; readonly value: DispatchProductionConfiguration }
		| { readonly ok: false; readonly message: string }
	>;
}

export interface DispatchBuildOutputGateway {
	promoteVerifiedBuildOutput(): Promise<
		| { readonly ok: true; readonly artifactDigest: string }
		| {
				readonly ok: false;
				readonly phase: "verification" | "promotion";
				readonly message: string;
		  }
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
	): Promise<
		| { readonly ok: true; readonly value: VercelDeploymentRecord }
		| { readonly ok: false; readonly message: string }
	>;
}

export interface ProductionDeploymentContext {
	readonly repository: ProductionRepositoryGateway;
	readonly build: DeployableBuildGateway;
	readonly configuration: DispatchProductionConfigurationGateway;
	readonly artifacts: DispatchBuildOutputGateway;
	readonly deployments: VercelProductionDeploymentGateway;
	readonly progress: (message: string) => void;
}

export async function deployDispatchProduction(
	context: ProductionDeploymentContext,
): Promise<ProductionDeploymentOutcome> {
	context.progress("Checking production source state.");
	const source = await context.repository.inspectProductionSource();
	if (source.ok === false) {
		return failure("dirty-repository", source.message);
	}

	context.progress("Building package-local deployable.");
	const build = await context.build.buildPackageDeployable();
	if (build.ok === false) return failure("source-build-failed", build.message);

	context.progress("Validating dispatch project identity.");
	const configuration = await context.configuration.readProductionConfiguration();
	if (configuration.ok === false) {
		return failure("project-identity-mismatch", configuration.message);
	}
	const identityProblem = findIdentityProblem(configuration.value);
	if (identityProblem !== undefined) return failure("project-identity-mismatch", identityProblem);

	context.progress("Transactionally promoting verified Build Output.");
	const promotion = await context.artifacts.promoteVerifiedBuildOutput();
	if (promotion.ok === false) {
		return failure(
			promotion.phase === "verification" ? "invalid-artifact" : "promotion-failed",
			promotion.message,
		);
	}

	context.progress("Deploying prebuilt output to Vercel production.");
	const deployed = await context.deployments.deployPrebuiltProduction();
	if (deployed.ok === false && deployed.locator === undefined) {
		return failure("deploy-failed", deployed.message);
	}
	const locator = deployed.locator;
	if (locator === undefined) return failure("ambiguous-upload", "Deployment returned no locator.");

	context.progress("Inspecting immutable deployment identity.");
	const immutable = await context.deployments.inspectDeployment(locator);
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
	const alias = await context.deployments.inspectDeployment(configuration.value.productionAlias);
	if (alias.ok === false) return failure("deployment-inspection-failed", alias.message);
	if (alias.value.deploymentId !== immutable.value.deploymentId) {
		return failure("alias-mismatch", "The production alias identifies a different deployment.");
	}

	return {
		ok: true,
		value: productionDeploymentResultSchema.parse({
			status: "ok",
			deploymentId: immutable.value.deploymentId,
			deploymentUrl: normalizeHttpsUrl(immutable.value.deploymentUrl),
			productionAlias: configuration.value.productionAlias,
			gitCommitSha: source.commitSha,
			projectId: configuration.value.configuredProjectId,
			artifactDigest: promotion.artifactDigest,
		}),
	};
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

function normalizeHttpsUrl(value: string): string {
	return value.startsWith("https://") ? value : `https://${value}`;
}

function failure(
	code: ProductionDeploymentFailureCode,
	message: string,
): ProductionDeploymentOutcome {
	return { ok: false, code, message };
}
