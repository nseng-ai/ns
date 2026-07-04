import type { AregCliContext } from "../context.ts";
import type { AregErrorInfo, AregProjectMutationPolicy } from "../gateways.ts";

interface ProjectTextWritePlan {
	relativePath: string;
	content: string;
	description: string;
	createParent: boolean;
}

interface ProjectDeletePlan {
	relativePath: string;
	description: string;
}

interface ProjectRemoveEmptyDirPlan {
	relativePath: string;
	description: string;
}

interface ProjectDeleteSymlinkPlan {
	relativePath: string;
	description: string;
}

interface BaseApplyProjectMutationPlanRequest {
	ctx: AregCliContext;
	projectDir: string;
	writes: readonly ProjectTextWritePlan[];
	execute?: boolean;
}

type ApplyProjectMutationPlanRequest =
	| (BaseApplyProjectMutationPlanRequest & {
			policy: Exclude<AregProjectMutationPolicy, "skill-kind">;
	  })
	| (BaseApplyProjectMutationPlanRequest & {
			policy: "skill-kind";
			deletes: readonly ProjectDeletePlan[];
			deleteSymlinks: readonly ProjectDeleteSymlinkPlan[];
			removeEmptyDirs: readonly ProjectRemoveEmptyDirPlan[];
	  });

export const PROJECT_FILE_MUTATION_OPERATION_TYPES = [
	"write",
	"delete",
	"delete-symlink",
	"remove-empty-dir",
] as const;
export const PROJECT_MUTATION_OPERATION_TYPES = [
	...PROJECT_FILE_MUTATION_OPERATION_TYPES,
	"external",
] as const;
export const PROJECT_MUTATION_OPERATION_STATUSES = [
	"applied",
	"failed",
	"not-attempted",
	"skipped",
] as const;

export type ProjectFileMutationOperationType =
	(typeof PROJECT_FILE_MUTATION_OPERATION_TYPES)[number];
export type ProjectMutationOperationType = (typeof PROJECT_MUTATION_OPERATION_TYPES)[number];
export type ProjectMutationOperationStatus = (typeof PROJECT_MUTATION_OPERATION_STATUSES)[number];

export interface ProjectMutationOperationStatusRecord {
	type: ProjectMutationOperationType;
	path: string;
	description: string;
	status: ProjectMutationOperationStatus;
	error?: AregErrorInfo;
}

interface ProjectMutationOperationBase {
	type: ProjectFileMutationOperationType;
	relativePath: string;
	description: string;
}

interface WriteOperation extends ProjectMutationOperationBase {
	type: "write";
	plan: ProjectTextWritePlan;
}

interface DeleteOperation extends ProjectMutationOperationBase {
	type: "delete";
	plan: ProjectDeletePlan;
}

interface RemoveEmptyDirOperation extends ProjectMutationOperationBase {
	type: "remove-empty-dir";
	plan: ProjectRemoveEmptyDirPlan;
}

interface DeleteSymlinkOperation extends ProjectMutationOperationBase {
	type: "delete-symlink";
	plan: ProjectDeleteSymlinkPlan;
}

type ProjectMutationOperation =
	| WriteOperation
	| DeleteOperation
	| DeleteSymlinkOperation
	| RemoveEmptyDirOperation;

interface ApplyProjectMutationPlanSuccessFields {
	writtenRelativePaths: readonly string[];
	deletedRelativePaths: readonly string[];
	deletedSymlinkRelativePaths: readonly string[];
	removedEmptyDirRelativePaths: readonly string[];
	operationStatuses: readonly ProjectMutationOperationStatusRecord[];
}

interface AppliedProjectMutationPaths {
	writtenRelativePaths: string[];
	deletedRelativePaths: string[];
	deletedSymlinkRelativePaths: string[];
	removedEmptyDirRelativePaths: string[];
}

type ProjectMutationOperationResult =
	| { ok: true; removed?: boolean }
	| { ok: false; error: AregErrorInfo };

interface ProjectMutationOperationHandler<Operation extends ProjectMutationOperation> {
	preflight(
		request: ApplyProjectMutationPlanRequest,
		operation: Operation,
	): Promise<{ ok: true } | { ok: false; error: AregErrorInfo }>;
	apply(
		request: ApplyProjectMutationPlanRequest,
		operation: Operation,
	): Promise<ProjectMutationOperationResult>;
	recordSuccess(
		paths: AppliedProjectMutationPaths,
		operation: Operation,
		result: Extract<ProjectMutationOperationResult, { ok: true }>,
	): ProjectMutationOperationStatus;
}

export type ApplyProjectMutationPlanResult =
	| ({ ok: true } & ApplyProjectMutationPlanSuccessFields)
	| ({ ok: false; error: AregErrorInfo } & ApplyProjectMutationPlanSuccessFields);

export async function applyProjectMutationPlan(
	request: ApplyProjectMutationPlanRequest,
): Promise<ApplyProjectMutationPlanResult> {
	const operations = flattenProjectMutationPlan(request);
	const preflightStatuses: ProjectMutationOperationStatusRecord[] = [];
	let firstPreflightError: AregErrorInfo | undefined;

	for (const operation of operations) {
		const result = await operationHandler(operation).preflight(request, operation);
		if (result.ok) {
			preflightStatuses.push(operationStatus(operation, "not-attempted"));
			continue;
		}
		firstPreflightError ??= result.error;
		preflightStatuses.push(operationStatus(operation, "failed", result.error));
	}
	if (firstPreflightError !== undefined) {
		return emptyFailure(firstPreflightError, preflightStatuses);
	}
	if (request.execute === false) {
		return {
			ok: true,
			writtenRelativePaths: [],
			deletedRelativePaths: [],
			deletedSymlinkRelativePaths: [],
			removedEmptyDirRelativePaths: [],
			operationStatuses: preflightStatuses,
		};
	}

	const writtenRelativePaths: string[] = [];
	const deletedRelativePaths: string[] = [];
	const deletedSymlinkRelativePaths: string[] = [];
	const removedEmptyDirRelativePaths: string[] = [];
	const operationStatuses: ProjectMutationOperationStatusRecord[] = [];
	for (let index = 0; index < operations.length; index += 1) {
		const operation = operations[index];
		if (operation === undefined) continue;
		const result = await operationHandler(operation).apply(request, operation);
		if (!result.ok) {
			operationStatuses.push(operationStatus(operation, "failed", result.error));
			for (const remaining of operations.slice(index + 1))
				operationStatuses.push(operationStatus(remaining, "not-attempted"));
			return {
				ok: false,
				error: result.error,
				writtenRelativePaths,
				deletedRelativePaths,
				deletedSymlinkRelativePaths,
				removedEmptyDirRelativePaths,
				operationStatuses,
			};
		}
		const status = operationHandler(operation).recordSuccess(
			{
				writtenRelativePaths,
				deletedRelativePaths,
				deletedSymlinkRelativePaths,
				removedEmptyDirRelativePaths,
			},
			operation,
			result,
		);
		operationStatuses.push(operationStatus(operation, status));
	}

	return {
		ok: true,
		writtenRelativePaths,
		deletedRelativePaths,
		deletedSymlinkRelativePaths,
		removedEmptyDirRelativePaths,
		operationStatuses,
	};
}

function flattenProjectMutationPlan(
	request: ApplyProjectMutationPlanRequest,
): ProjectMutationOperation[] {
	const writes = request.writes.map(
		(plan): WriteOperation => ({
			type: "write",
			relativePath: plan.relativePath,
			description: plan.description,
			plan,
		}),
	);
	if (request.policy !== "skill-kind") return writes;
	const deletes = request.deletes.map(
		(plan): DeleteOperation => ({
			type: "delete",
			relativePath: plan.relativePath,
			description: plan.description,
			plan,
		}),
	);
	const deleteSymlinks = request.deleteSymlinks.map(
		(plan): DeleteSymlinkOperation => ({
			type: "delete-symlink",
			relativePath: plan.relativePath,
			description: plan.description,
			plan,
		}),
	);
	const removeEmptyDirs = request.removeEmptyDirs.map(
		(plan): RemoveEmptyDirOperation => ({
			type: "remove-empty-dir",
			relativePath: plan.relativePath,
			description: plan.description,
			plan,
		}),
	);
	return [...writes, ...deletes, ...deleteSymlinks, ...removeEmptyDirs];
}

const PROJECT_MUTATION_OPERATION_HANDLERS = {
	write: {
		async preflight(request, operation) {
			return await request.ctx.project.preflightWriteTextFile({
				projectDir: request.projectDir,
				relativePath: operation.plan.relativePath,
				content: operation.plan.content,
				description: operation.plan.description,
				createParent: operation.plan.createParent,
				policy: request.policy,
				env: request.ctx.env,
			});
		},
		async apply(request, operation) {
			return await request.ctx.project.writeTextFile({
				projectDir: request.projectDir,
				relativePath: operation.plan.relativePath,
				content: operation.plan.content,
				description: operation.plan.description,
				createParent: operation.plan.createParent,
				policy: request.policy,
				env: request.ctx.env,
			});
		},
		recordSuccess(paths, operation) {
			paths.writtenRelativePaths.push(operation.relativePath);
			return "applied";
		},
	},
	delete: {
		async preflight(request, operation) {
			return await request.ctx.project.preflightDeleteFile({
				projectDir: request.projectDir,
				relativePath: operation.plan.relativePath,
				description: operation.plan.description,
				policy: "skill-kind",
				env: request.ctx.env,
			});
		},
		async apply(request, operation) {
			return await request.ctx.project.deleteFile({
				projectDir: request.projectDir,
				relativePath: operation.plan.relativePath,
				description: operation.plan.description,
				policy: "skill-kind",
				env: request.ctx.env,
			});
		},
		recordSuccess(paths, operation) {
			paths.deletedRelativePaths.push(operation.relativePath);
			return "applied";
		},
	},
	"delete-symlink": {
		async preflight(request, operation) {
			return await request.ctx.project.preflightDeleteSymlink({
				projectDir: request.projectDir,
				relativePath: operation.plan.relativePath,
				description: operation.plan.description,
				policy: "skill-kind",
				env: request.ctx.env,
			});
		},
		async apply(request, operation) {
			return await request.ctx.project.deleteSymlink({
				projectDir: request.projectDir,
				relativePath: operation.plan.relativePath,
				description: operation.plan.description,
				policy: "skill-kind",
				env: request.ctx.env,
			});
		},
		recordSuccess(paths, operation) {
			paths.deletedSymlinkRelativePaths.push(operation.relativePath);
			return "applied";
		},
	},
	"remove-empty-dir": {
		async preflight(request, operation) {
			return await request.ctx.project.preflightRemoveEmptyDir({
				projectDir: request.projectDir,
				relativePath: operation.plan.relativePath,
				description: operation.plan.description,
				policy: "skill-kind",
				env: request.ctx.env,
			});
		},
		async apply(request, operation) {
			const result = await request.ctx.project.removeEmptyDir({
				projectDir: request.projectDir,
				relativePath: operation.plan.relativePath,
				description: operation.plan.description,
				policy: "skill-kind",
				env: request.ctx.env,
			});
			return result.ok ? { ok: true, removed: result.removed } : result;
		},
		recordSuccess(paths, operation, result) {
			if (result.removed) {
				paths.removedEmptyDirRelativePaths.push(operation.relativePath);
				return "applied";
			}
			return "skipped";
		},
	},
} satisfies {
	readonly [OperationType in ProjectFileMutationOperationType]: ProjectMutationOperationHandler<
		Extract<ProjectMutationOperation, { type: OperationType }>
	>;
};

function operationHandler<Operation extends ProjectMutationOperation>(
	operation: Operation,
): ProjectMutationOperationHandler<Operation> {
	return PROJECT_MUTATION_OPERATION_HANDLERS[
		operation.type
	] as ProjectMutationOperationHandler<Operation>;
}

function emptyFailure(
	error: AregErrorInfo,
	operationStatuses: readonly ProjectMutationOperationStatusRecord[],
): ApplyProjectMutationPlanResult {
	return {
		ok: false,
		error,
		writtenRelativePaths: [],
		deletedRelativePaths: [],
		deletedSymlinkRelativePaths: [],
		removedEmptyDirRelativePaths: [],
		operationStatuses,
	};
}

function operationStatus(
	operation: ProjectMutationOperation,
	status: ProjectMutationOperationStatus,
	error?: AregErrorInfo,
): ProjectMutationOperationStatusRecord {
	return {
		type: operation.type,
		path: operation.relativePath,
		description: operation.description,
		status,
		...(error === undefined ? {} : { error }),
	};
}
