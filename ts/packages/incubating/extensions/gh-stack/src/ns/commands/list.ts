import { NsCommandExecApi } from "@nseng-ai/extension-kit/command-runner";
import { createNsGitGateway } from "@nseng-ai/extension-kit";
import type { Clock } from "@nseng-ai/foundation/clock";
import { systemClock } from "@nseng-ai/foundation/time";
import {
	defineCommand,
	failure,
	ok,
	usageError,
	z,
	type NsCommand,
	type NsExtensionApi,
} from "@nseng-ai/sdk";

import { listGhStacks } from "../../core/list.ts";
import type {
	GhStackFailureEvidence,
	GhStackInventory,
	GhStackInventoryFailure,
	GhStackInventoryItem,
} from "../../core/types.ts";
import { createRealGhStackListContext } from "../../core/gateways/real.ts";
import type { GhStackListContext } from "../../core/gateways/contracts.ts";

export const DEFAULT_GH_STACK_LIST_LIMIT = 100;
export const MAX_GH_STACK_LIST_LIMIT = 1_000;

const limitInputSchema = z
	.string()
	.optional()
	.describe(
		`Maximum stacks to return (positive integer, maximum ${MAX_GH_STACK_LIST_LIMIT}; default ${DEFAULT_GH_STACK_LIST_LIMIT}).`,
	);

export const ghStackListRequestSchema = z.object({ limit: limitInputSchema });

const statusSchema = z
	.object({
		merged: z.number().int().nonnegative(),
		open: z.number().int().nonnegative(),
		closed: z.number().int().nonnegative(),
		unpushed: z.number().int().nonnegative(),
	})
	.strict();

const stackSchema = z
	.object({
		number: z.number().int().positive().nullable(),
		branches: z.array(z.string().min(1)).min(1),
		bottomBranch: z.string().min(1),
		topBranch: z.string().min(1),
		base: z.string().min(1),
		type: z.enum(["local", "remote"]),
		status: statusSchema,
		createdAt: z.string().datetime({ offset: true }).nullable(),
	})
	.strict();

export const ghStackListResultSchema = z
	.object({
		stacks: z.array(stackSchema),
		limit: z.number().int().positive().max(MAX_GH_STACK_LIST_LIMIT),
		returned: z.number().int().nonnegative(),
		total: z.number().int().nonnegative(),
		truncated: z.boolean(),
	})
	.strict();

export interface GhStackListCommandDependencies {
	readonly createContext: (ctx: NsExtensionApi) => GhStackListContext;
	readonly clock: Clock;
}

export function createGhStackListNsCommand(
	dependencies: GhStackListCommandDependencies,
): NsCommand<typeof ghStackListRequestSchema, GhStackInventory> {
	return defineCommand({
		schema: ghStackListRequestSchema,
		options: { limit: { short: "-L" } },
		resultSchema: ghStackListResultSchema,
		handler: async (ctx, request) => {
			const limit = parseLimit(request.limit);
			if (!limit.ok) {
				return usageError(limit.message, {
					argument: "--limit",
					value: request.limit ?? null,
					minimum: 1,
					maximum: MAX_GH_STACK_LIST_LIMIT,
				});
			}
			const result = await listGhStacks({
				context: dependencies.createContext(ctx),
				limit: limit.value,
			});
			if (!result.ok) {
				return failure(
					result.error.type,
					failureMessage(result.error),
					boundedEvidence(result.error.evidence),
				);
			}
			return ok(result.value);
		},
		renderHuman: (result) => renderGhStackList(result, dependencies.clock),
		renderMarkdown: (result) => renderGhStackList(result, dependencies.clock),
	});
}

export const ghStackListNsCommand = createGhStackListNsCommand({
	createContext: createCommandContext,
	clock: systemClock,
});

function createCommandContext(ctx: NsExtensionApi): GhStackListContext {
	const override = readListContextOverride(ctx);
	if (override !== undefined) return override;
	// NsCommandExecApi deliberately keeps execution on the host command channel. It validates the
	// adapter's cwd against ctx.cwd and uses the host-bound environment rather than accepting a
	// per-call environment override, so both gateway inputs are bound from this same command context.
	return createRealGhStackListContext({
		cwd: ctx.cwd,
		env: ctx.env,
		exec: new NsCommandExecApi(ctx),
		git: createNsGitGateway(ctx),
	});
}

function readListContextOverride(ctx: NsExtensionApi): GhStackListContext | undefined {
	const value = ctx.extensions?.ghStack;
	if (typeof value !== "object" || value === null || !("listContext" in value)) return undefined;
	return (value as { readonly listContext?: GhStackListContext }).listContext;
}

function parseLimit(
	input: string | undefined,
):
	| { readonly ok: true; readonly value: number }
	| { readonly ok: false; readonly message: string } {
	if (input === undefined) return { ok: true, value: DEFAULT_GH_STACK_LIST_LIMIT };
	const text = String(input);
	if (!/^[0-9]+$/.test(text)) {
		return { ok: false, message: "--limit must be a positive integer." };
	}
	const value = Number(text);
	if (!Number.isSafeInteger(value) || value < 1) {
		return { ok: false, message: "--limit must be a positive integer." };
	}
	if (value > MAX_GH_STACK_LIST_LIMIT) {
		return {
			ok: false,
			message: `--limit must not exceed ${MAX_GH_STACK_LIST_LIMIT}.`,
		};
	}
	return { ok: true, value };
}

function failureMessage(failureValue: GhStackInventoryFailure): string {
	switch (failureValue.type) {
		case "gh-stack-extension-unavailable":
			return "The github/gh-stack extension is unavailable. Install it with `gh extension install github/gh-stack`.";
		case "git-repository-unavailable":
			return "The current directory is not an available Git repository.";
		case "gh-stack-state-read-failed":
			return "Could not read local gh-stack state.";
		case "gh-stack-state-unsupported":
			return "Local gh-stack state is not safely interpretable.";
		case "github-stack-discovery-failed":
			return "Could not query GitHub stacks. Check `gh auth status` and network access.";
		case "github-stacks-unavailable":
			return "GitHub Stacks is unavailable for this repository.";
		case "github-stack-response-unsupported":
			return "The GitHub Stacks response is not safely interpretable.";
		case "gh-stack-reconciliation-failed":
			return "Local and remote gh-stack state could not be reconciled safely.";
	}
}

function boundedEvidence(evidence: GhStackFailureEvidence): GhStackFailureEvidence {
	return {
		...(evidence.command === undefined ? {} : { command: evidence.command.slice(0, 500) }),
		...(evidence.cwd === undefined ? {} : { cwd: evidence.cwd.slice(0, 500) }),
		...(evidence.summary === undefined ? {} : { summary: evidence.summary.slice(0, 500) }),
		...(evidence.detail === undefined ? {} : { detail: evidence.detail.slice(0, 500) }),
	};
}

export function renderGhStackList(result: GhStackInventory, clock: Clock): string {
	if (result.stacks.length === 0) return "No active stacks found.";
	const rows = result.stacks.map((stack) => [
		stack.number === null ? "—" : String(stack.number),
		formatBranches(stack),
		stack.base,
		formatStatus(stack),
		stack.type === "local" ? "Local" : "Remote",
		formatCreated(stack.createdAt, clock),
	]);
	const table = renderTable(["NUMBER", "BRANCHES", "BASE", "STATUS", "TYPE", "CREATED"], rows);
	if (!result.truncated) return table;
	const larger = Math.min(MAX_GH_STACK_LIST_LIMIT, Math.max(result.limit + 1, result.total));
	return `${table}\n\nShowing ${result.returned} of ${result.total} stacks. Run \`ns gs list --limit ${larger}\` to show more.`;
}

function formatBranches(stack: GhStackInventoryItem): string {
	return stack.bottomBranch === stack.topBranch
		? stack.bottomBranch
		: `${stack.bottomBranch}...${stack.topBranch}`;
}

function formatStatus(stack: GhStackInventoryItem): string {
	const counts: string[] = [];
	for (const key of ["merged", "open", "closed", "unpushed"] as const) {
		const count = stack.status[key];
		if (count > 0) counts.push(`${count} ${key}`);
	}
	return counts.join(", ");
}

function formatCreated(createdAt: string | null, clock: Clock): string {
	if (createdAt === null) return "—";
	const elapsedMs = Math.max(0, clock.nowMs() - Date.parse(createdAt));
	const minutes = Math.floor(elapsedMs / 60_000);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.floor(months / 12)}y ago`;
}

function renderTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
	const widths = headers.map((header, index) =>
		Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
	);
	return [headers, ...rows]
		.map((row) =>
			row
				.map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0)))
				.join("  "),
		)
		.join("\n");
}

export default ghStackListNsCommand;
