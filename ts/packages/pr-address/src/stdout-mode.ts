import { z } from "zod";

import { requireSafeSegment, type PayloadArtifactStore, type PayloadReference, type PayloadResult } from "./payload-store.ts";

export const stdoutModeSchema = z.enum(["full", "compact"]).default("compact");
export type StdoutMode = z.infer<typeof stdoutModeSchema>;

export interface ProducedArtifactReference {
	kind: string;
	reference: PayloadReference;
}

export interface CompactOperationArtifacts {
	full_output?: PayloadReference | undefined;
	produced?: readonly ProducedArtifactReference[] | undefined;
}

export interface CompactOperationResultOptions {
	operation: string;
	counts?: Record<string, unknown> | undefined;
	summary?: Record<string, unknown> | undefined;
	errors?: readonly unknown[] | undefined;
	warnings?: readonly unknown[] | undefined;
	resolvedInputs?: unknown;
	artifacts?: CompactOperationArtifacts | undefined;
	details?: Record<string, unknown> | undefined;
}

export interface GenericFullOutputArtifact {
	artifact_kind: "operation_output";
	operation: string;
	stdout_mode: "full";
	data: unknown;
}

export function compactOperationResult(options: CompactOperationResultOptions): Record<string, unknown> {
	const result: Record<string, unknown> = { operation: options.operation };
	if (options.counts !== undefined) result.counts = options.counts;
	if (options.summary !== undefined) result.summary = options.summary;
	if (options.errors !== undefined && options.errors.length > 0) result.errors = [...options.errors];
	if (options.warnings !== undefined && options.warnings.length > 0) result.warnings = [...options.warnings];
	if (options.resolvedInputs !== undefined) result.resolved_inputs = options.resolvedInputs;
	if (options.artifacts !== undefined) {
		const artifacts: Record<string, unknown> = {};
		if (options.artifacts.full_output !== undefined) artifacts.full_output = options.artifacts.full_output;
		if (options.artifacts.produced !== undefined && options.artifacts.produced.length > 0) artifacts.produced = options.artifacts.produced.map((artifact) => ({ ...artifact }));
		if (Object.keys(artifacts).length > 0) result.artifacts = artifacts;
	}
	if (options.details !== undefined) result.details = options.details;
	return result;
}

export async function writeGenericFullOutputArtifact(options: {
	store: PayloadArtifactStore;
	operation: string;
	data: unknown;
}): Promise<PayloadResult<PayloadReference>> {
	const descriptor = operationOutputArtifactDescriptor(options.operation);
	return await options.store.writeJsonArtifact({
		descriptor,
		role: "summary",
		payload: {
			artifact_kind: "operation_output",
			operation: options.operation,
			stdout_mode: "full",
			data: options.data,
		} satisfies GenericFullOutputArtifact,
	});
}

export function operationOutputArtifactDescriptor(operation: string): string {
	return requireSafeSegment(`pr-address-command-${operation}-output`, { label: "operation output descriptor" });
}
