import { z } from "zod";

import type { LocalStack, RemoteStack } from "../types.ts";

const nonemptyStringSchema = z.string().trim().min(1);
const positiveIntegerSchema = z.number().int().positive();

const localPullRequestSchema = z
	.object({
		number: positiveIntegerSchema,
		merged: z.boolean().optional(),
	})
	.passthrough();

const localBranchSchema = z
	.object({
		branch: nonemptyStringSchema,
		pullRequest: localPullRequestSchema.optional(),
	})
	.passthrough();

const localStackSchema = z
	.object({
		id: nonemptyStringSchema.optional(),
		number: positiveIntegerSchema.optional(),
		trunk: z.object({ branch: nonemptyStringSchema }).passthrough(),
		branches: z.array(localBranchSchema).min(1),
	})
	.passthrough();

const localStackFileSchema = z
	.object({
		schemaVersion: z.unknown().optional(),
		stacks: z.array(localStackSchema),
	})
	.passthrough();

const remotePullRequestSchema = z
	.object({
		number: positiveIntegerSchema,
		state: z.enum(["open", "closed"]),
		merged_at: z.iso.datetime({ offset: true }).nullable(),
		head: z.object({ ref: nonemptyStringSchema }).passthrough(),
	})
	.passthrough();

const remoteStackSchema = z
	.object({
		id: z.union([positiveIntegerSchema, nonemptyStringSchema]),
		number: positiveIntegerSchema,
		base: z.object({ ref: nonemptyStringSchema }).passthrough(),
		created_at: z.iso.datetime({ offset: true }),
		pull_requests: z.array(remotePullRequestSchema).min(1),
	})
	.passthrough();

export type ProviderParseResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly detail: string };

export function parseLocalStackFile(input: unknown): ProviderParseResult<readonly LocalStack[]> {
	const parsed = localStackFileSchema.safeParse(input);
	if (!parsed.success) return { ok: false, detail: formatIssues(parsed.error) };
	return {
		ok: true,
		value: parsed.data.stacks.map((stack) => ({
			id: stack.id ?? null,
			number: stack.number ?? null,
			base: stack.trunk.branch,
			branches: stack.branches.map((branch) => ({
				name: branch.branch,
				pullRequest:
					branch.pullRequest === undefined
						? null
						: { number: branch.pullRequest.number, merged: branch.pullRequest.merged ?? false },
			})),
		})),
	};
}

export function parseRemoteStackPages(input: unknown): ProviderParseResult<readonly RemoteStack[]> {
	if (!Array.isArray(input)) return { ok: false, detail: "response must be an array" };
	const flattened = input.every(Array.isArray) ? input.flat() : input;
	const parsed = z.array(remoteStackSchema).safeParse(flattened);
	if (!parsed.success) return { ok: false, detail: formatIssues(parsed.error) };
	return {
		ok: true,
		value: parsed.data.map((stack) => ({
			id: String(stack.id),
			number: stack.number,
			base: stack.base.ref,
			createdAt: new Date(stack.created_at).toISOString(),
			pullRequests: stack.pull_requests.map((pullRequest) => ({
				number: pullRequest.number,
				state: pullRequest.state,
				mergedAt:
					pullRequest.merged_at === null ? null : new Date(pullRequest.merged_at).toISOString(),
				branch: pullRequest.head.ref,
			})),
		})),
	};
}

function formatIssues(error: z.ZodError): string {
	return error.issues
		.slice(0, 3)
		.map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`)
		.join("; ")
		.slice(0, 500);
}
