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

interface BaseApplyProjectMutationPlanRequest {
	ctx: AregCliContext;
	projectDir: string;
	writes: readonly ProjectTextWritePlan[];
	execute?: boolean | undefined;
}

type ApplyProjectMutationPlanRequest =
	| (BaseApplyProjectMutationPlanRequest & { policy: Exclude<AregProjectMutationPolicy, "skill-kind"> })
	| (BaseApplyProjectMutationPlanRequest & {
		policy: "skill-kind";
		deletes: readonly ProjectDeletePlan[];
		removeEmptyDirs: readonly ProjectRemoveEmptyDirPlan[];
	});

export const PROJECT_FILE_MUTATION_OPERATION_TYPES = ["write", "delete", "remove_empty_dir"] as const;
export const PROJECT_MUTATION_OPERATION_TYPES = [...PROJECT_FILE_MUTATION_OPERATION_TYPES, "external"] as const;
export const PROJECT_MUTATION_OPERATION_STATUSES = ["applied", "failed", "not_attempted", "skipped"] as const;

export type ProjectFileMutationOperationType = (typeof PROJECT_FILE_MUTATION_OPERATION_TYPES)[number];
export type ProjectMutationOperationType = (typeof PROJECT_MUTATION_OPERATION_TYPES)[number];
export type ProjectMutationOperationStatus = (typeof PROJECT_MUTATION_OPERATION_STATUSES)[number];

export interface ProjectMutationOperationStatusRecord {
	type: ProjectMutationOperationType;
	path: string;
	description: string;
	status: ProjectMutationOperationStatus;
	error?: AregErrorInfo | undefined;
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
	type: "remove_empty_dir";
	plan: ProjectRemoveEmptyDirPlan;
}

type ProjectMutationOperation = WriteOperation | DeleteOperation | RemoveEmptyDirOperation;

interface ApplyProjectMutationPlanSuccessFields {
	writtenRelativePaths: readonly string[];
	deletedRelativePaths: readonly string[];
	removedEmptyDirRelativePaths: readonly string[];
	operationStatuses: readonly ProjectMutationOperationStatusRecord[];
}

export type ApplyProjectMutationPlanResult =
	| ({ ok: true } & ApplyProjectMutationPlanSuccessFields)
	| ({ ok: false; error: AregErrorInfo } & ApplyProjectMutationPlanSuccessFields);

export async function applyProjectMutationPlan(request: ApplyProjectMutationPlanRequest): Promise<ApplyProjectMutationPlanResult> {
	const operations = flattenProjectMutationPlan(request);
	const preflightStatuses: ProjectMutationOperationStatusRecord[] = [];
	let firstPreflightError: AregErrorInfo | undefined;

	for (const operation of operations) {
		const result = await preflightOperation(request, operation);
		if (result.ok) {
			preflightStatuses.push(operationStatus(operation, "not_attempted"));
			continue;
		}
		firstPreflightError ??= result.error;
		preflightStatuses.push(operationStatus(operation, "failed", result.error));
	}
	if (firstPreflightError !== undefined) {
		return emptyFailure(firstPreflightError, preflightStatuses);
	}
	if (request.execute === false) {
		return { ok: true, writtenRelativePaths: [], deletedRelativePaths: [], removedEmptyDirRelativePaths: [], operationStatuses: preflightStatuses };
	}

	const writtenRelativePaths: string[] = [];
	const deletedRelativePaths: string[] = [];
	const removedEmptyDirRelativePaths: string[] = [];
	const operationStatuses: ProjectMutationOperationStatusRecord[] = [];
	for (let index = 0; index < operations.length; index += 1) {
		const operation = operations[index];
		if (operation === undefined) continue;
		const result = await applyOperation(request, operation);
		if (!result.ok) {
			operationStatuses.push(operationStatus(operation, "failed", result.error));
			for (const remaining of operations.slice(index + 1)) operationStatuses.push(operationStatus(remaining, "not_attempted"));
			return { ok: false, error: result.error, writtenRelativePaths, deletedRelativePaths, removedEmptyDirRelativePaths, operationStatuses };
		}
		if (operation.type === "write") {
			writtenRelativePaths.push(operation.relativePath);
			operationStatuses.push(operationStatus(operation, "applied"));
		} else if (operation.type === "delete") {
			deletedRelativePaths.push(operation.relativePath);
			operationStatuses.push(operationStatus(operation, "applied"));
		} else if (result.removed) {
			removedEmptyDirRelativePaths.push(operation.relativePath);
			operationStatuses.push(operationStatus(operation, "applied"));
		} else {
			operationStatuses.push(operationStatus(operation, "skipped"));
		}
	}

	return { ok: true, writtenRelativePaths, deletedRelativePaths, removedEmptyDirRelativePaths, operationStatuses };
}

function flattenProjectMutationPlan(request: ApplyProjectMutationPlanRequest): ProjectMutationOperation[] {
	const writes = request.writes.map((plan): WriteOperation => ({ type: "write", relativePath: plan.relativePath, description: plan.description, plan }));
	if (request.policy !== "skill-kind") return writes;
	const deletes = request.deletes.map((plan): DeleteOperation => ({ type: "delete", relativePath: plan.relativePath, description: plan.description, plan }));
	const removeEmptyDirs = request.removeEmptyDirs.map((plan): RemoveEmptyDirOperation => ({ type: "remove_empty_dir", relativePath: plan.relativePath, description: plan.description, plan }));
	return [...writes, ...deletes, ...removeEmptyDirs];
}

async function preflightOperation(request: ApplyProjectMutationPlanRequest, operation: ProjectMutationOperation): Promise<{ ok: true } | { ok: false; error: AregErrorInfo }> {
	switch (operation.type) {
		case "write":
			return await request.ctx.project.preflightWriteTextFile({
				projectDir: request.projectDir,
				relativePath: operation.plan.relativePath,
				content: operation.plan.content,
				description: operation.plan.description,
				createParent: operation.plan.createParent,
				policy: request.policy,
				env: request.ctx.env,
			});
		case "delete":
			return await request.ctx.project.preflightDeleteFile({
				projectDir: request.projectDir,
				relativePath: operation.plan.relativePath,
				description: operation.plan.description,
				policy: "skill-kind",
				env: request.ctx.env,
			});
		case "remove_empty_dir":
			return await request.ctx.project.preflightRemoveEmptyDir({
				projectDir: request.projectDir,
				relativePath: operation.plan.relativePath,
				description: operation.plan.description,
				policy: "skill-kind",
				env: request.ctx.env,
			});
	}
}

async function applyOperation(request: ApplyProjectMutationPlanRequest, operation: ProjectMutationOperation): Promise<{ ok: true; removed?: boolean | undefined } | { ok: false; error: AregErrorInfo }> {
	switch (operation.type) {
		case "write":
			return await request.ctx.project.writeTextFile({
				projectDir: request.projectDir,
				relativePath: operation.plan.relativePath,
				content: operation.plan.content,
				description: operation.plan.description,
				createParent: operation.plan.createParent,
				policy: request.policy,
				env: request.ctx.env,
			});
		case "delete":
			return await request.ctx.project.deleteFile({
				projectDir: request.projectDir,
				relativePath: operation.plan.relativePath,
				description: operation.plan.description,
				policy: "skill-kind",
				env: request.ctx.env,
			});
		case "remove_empty_dir": {
			const result = await request.ctx.project.removeEmptyDir({
				projectDir: request.projectDir,
				relativePath: operation.plan.relativePath,
				description: operation.plan.description,
				policy: "skill-kind",
				env: request.ctx.env,
			});
			return result.ok ? { ok: true, removed: result.removed } : result;
		}
	}
}

function emptyFailure(error: AregErrorInfo, operationStatuses: readonly ProjectMutationOperationStatusRecord[]): ApplyProjectMutationPlanResult {
	return {
		ok: false,
		error,
		writtenRelativePaths: [],
		deletedRelativePaths: [],
		removedEmptyDirRelativePaths: [],
		operationStatuses,
	};
}

export function createProjectMutationOperationStatusRecord(options: ProjectMutationOperationStatusRecord): ProjectMutationOperationStatusRecord {
	return { ...options };
}

function operationStatus(operation: ProjectMutationOperation, status: ProjectMutationOperationStatus, error?: AregErrorInfo | undefined): ProjectMutationOperationStatusRecord {
	return createProjectMutationOperationStatusRecord({
		type: operation.type,
		path: operation.relativePath,
		description: operation.description,
		status,
		error,
	});
}
