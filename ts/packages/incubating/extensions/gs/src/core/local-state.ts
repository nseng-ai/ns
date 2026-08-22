import { z } from "zod";

import type { GsLocalInventory, GsLocalStack } from "./local-inventory.ts";

const localPullRequestSchema = z
	.object({
		number: z.number().int().positive(),
		merged: z.boolean().optional(),
	})
	.passthrough();

const nonemptyStringSchema = z.string().trim().min(1);

const localBranchSchema = z
	.object({
		branch: nonemptyStringSchema,
		pullRequest: localPullRequestSchema.optional(),
	})
	.passthrough();

const localStackSchema = z
	.object({
		number: z.number().int().positive().optional(),
		id: nonemptyStringSchema.optional(),
		trunk: z.object({ branch: nonemptyStringSchema }).passthrough(),
		branches: z.array(localBranchSchema).min(1),
	})
	.passthrough();

const localStateSchema = z
	.object({
		schemaVersion: z.number().int(),
		stacks: z.array(localStackSchema),
	})
	.passthrough();

export type GsLocalStateParseResult =
	| { readonly ok: true; readonly value: GsLocalInventory }
	| { readonly ok: false; readonly message: string };

export function parseGsLocalState(input: unknown): GsLocalStateParseResult {
	const parsed = localStateSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			message: `Local gh-stack state has an unsupported structure: ${z.prettifyError(parsed.error)}`,
		};
	}

	return {
		ok: true,
		value: sortGsLocalInventory({
			stacks: parsed.data.stacks.map((stack) => ({
				number: stack.number ?? null,
				base: stack.trunk.branch,
				branches: stack.branches.map((branch) => ({
					name: branch.branch,
					pullRequest:
						branch.pullRequest === undefined
							? null
							: {
									number: branch.pullRequest.number,
									recordedMerged: branch.pullRequest.merged ?? false,
								},
				})),
			})),
		}),
	};
}

export function sortGsLocalInventory(inventory: GsLocalInventory): GsLocalInventory {
	return {
		stacks: inventory.stacks.toSorted(compareStacks),
	};
}

export function gsLocalStackSummary(stack: GsLocalStack): string {
	const bottom = stack.branches[0];
	if (bottom === undefined) throw new Error("A local gh-stack stack must contain a branch.");
	if (stack.branches.length === 1) return bottom.name;

	const top = stack.branches.at(-1);
	if (top === undefined) throw new Error("A local gh-stack stack must contain a branch.");
	return `${bottom.name}...${top.name}`;
}

function compareStacks(left: GsLocalStack, right: GsLocalStack): number {
	if (left.number === null && right.number !== null) return -1;
	if (left.number !== null && right.number === null) return 1;
	if (left.number !== null && right.number !== null && left.number !== right.number) {
		return right.number - left.number;
	}
	return gsLocalStackSummary(left).localeCompare(gsLocalStackSummary(right));
}
