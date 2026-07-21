import type { CommandExecApi, ExecResult } from "@nseng-ai/foundation/exec";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { formatCommandOutput } from "@nseng-ai/pi/commands/helpers";
import { z } from "zod";

const RESTACK_PREFLIGHT_TIMEOUT_MS = 60_000;
const COMMAND_OUTPUT_TAIL_OPTIONS = { maxChars: 4_000, maxLines: 20 } as const;

const restackPreflightScopeSchema = z.enum(["downstack", "full"]);

const restackPreflightSlotConflictSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("checked-out-elsewhere"),
		branch: z.string(),
		worktreePath: z.string(),
	}),
	z.object({
		type: z.literal("rebase-in-progress"),
		branch: z.string(),
		worktreePath: z.string(),
		operation: z.string(),
	}),
	z.object({
		type: z.literal("slot-rebase-in-progress"),
		branch: z.string(),
		worktreePath: z.string(),
		operation: z.string(),
		slotName: z.string(),
	}),
]);

const restackPreflightDataSchema = z.object({
	clean: z.boolean(),
	tracked: z.boolean(),
	rebaseInProgress: z.boolean(),
	hasUpstackChildren: z.boolean(),
	requestedScope: restackPreflightScopeSchema,
	effectiveScope: restackPreflightScopeSchema,
	branches: z.array(z.string()),
	slotConflicts: z.array(restackPreflightSlotConflictSchema),
	warnings: z.array(z.string()),
});

const restackPreflightEnvelopeSchema = z.discriminatedUnion("status", [
	z.object({
		status: z.literal("ok"),
		exitCode: z.literal(0),
		data: restackPreflightDataSchema,
	}),
	z.object({
		status: z.literal("negative"),
		exitCode: z.literal(1),
		message: z.string(),
		data: restackPreflightDataSchema.optional(),
	}),
	z.object({
		status: z.literal("failure"),
		exitCode: z.literal(2),
		errorType: z.string(),
		message: z.string(),
		data: z.unknown().optional(),
	}),
	z.object({
		status: z.literal("usageError"),
		exitCode: z.literal(2),
		errorType: z.literal("usageError"),
		message: z.string(),
		data: z.unknown().optional(),
	}),
]);

type RestackPreflightData = z.infer<typeof restackPreflightDataSchema>;

export type SmartRestackPreflightResult =
	| { type: "ready" }
	| { type: "rebase-in-progress" }
	| { type: "refused"; message: string };

export type RunSmartRestackPreflight = (options: {
	cwd: string;
}) => Promise<SmartRestackPreflightResult>;

export interface CreateCommandRestackPreflightOptions {
	commands: CommandExecApi;
}

export function createCommandRestackPreflight(
	options: CreateCommandRestackPreflightOptions,
): RunSmartRestackPreflight {
	return async ({ cwd }) => {
		const result = await options.commands.exec(
			"ns",
			["slot", "gt", "exec", "restack-preflight", "--scope", "downstack", "--format", "json"],
			{ cwd, timeout: RESTACK_PREFLIGHT_TIMEOUT_MS },
		);
		if (result.type !== "exited" || result.signal !== null) return commandRefusal(result);

		let decoded: unknown;
		try {
			decoded = JSON.parse(result.stdout);
		} catch (error) {
			return {
				type: "refused",
				message: `Restack preflight returned malformed JSON; not starting gt restack.\n\n${formatErrorMessage(error)}`,
			};
		}

		const parsed = restackPreflightEnvelopeSchema.safeParse(decoded);
		if (!parsed.success) {
			return {
				type: "refused",
				message: `Restack preflight returned an invalid result; not starting gt restack.\n\n${z.prettifyError(parsed.error)}`,
			};
		}

		const envelope = parsed.data;
		if (result.code !== envelope.exitCode) {
			return {
				type: "refused",
				message: `Restack preflight process exited with code ${String(result.code)}, but its JSON envelope reported exitCode ${envelope.exitCode}; not starting gt restack.`,
			};
		}
		switch (envelope.status) {
			case "ok":
				return (
					warningRefusal(envelope.data) ??
					(indicatesRebaseInProgress(envelope.data)
						? { type: "rebase-in-progress" }
						: readyResult(envelope.data))
				);
			case "negative":
				return (
					warningRefusal(envelope.data) ??
					(indicatesRebaseInProgress(envelope.data)
						? { type: "rebase-in-progress" }
						: {
								type: "refused",
								message: formatNegativeRefusal(envelope.message, envelope.data),
							})
				);
			case "failure":
				return {
					type: "refused",
					message: `Restack preflight failed (${envelope.errorType}): ${envelope.message}\n\nNot starting gt restack.`,
				};
			case "usageError":
				return {
					type: "refused",
					message: `Restack preflight command was rejected: ${envelope.message}\n\nNot starting gt restack.`,
				};
		}
	};
}

function commandRefusal(result: ExecResult): SmartRestackPreflightResult {
	return {
		type: "refused",
		message: `Cannot run ns restack preflight; not starting gt restack.\n\n${formatCommandOutput(result, COMMAND_OUTPUT_TAIL_OPTIONS)}`,
	};
}

function warningRefusal(
	data: RestackPreflightData | undefined,
): SmartRestackPreflightResult | null {
	if (data === undefined || data.warnings.length === 0) return null;
	return {
		type: "refused",
		message: [
			"Restack preflight returned warnings that require review:",
			...data.warnings.map((warning) => `- ${warning}`),
			"Not starting gt restack or the resolver.",
		].join("\n\n"),
	};
}

function indicatesRebaseInProgress(data: RestackPreflightData | undefined): boolean {
	return data?.rebaseInProgress === true;
}

function readyResult(data: RestackPreflightData): SmartRestackPreflightResult {
	if (data.clean && data.tracked && data.slotConflicts.length === 0) return { type: "ready" };
	return {
		type: "refused",
		message: formatNegativeRefusal(
			"Restack preflight returned blocked facts in an ok envelope.",
			data,
		),
	};
}

function formatNegativeRefusal(message: string, data: RestackPreflightData | undefined): string {
	const reasons = [
		...(data?.clean === false ? ["The current worktree has uncommitted changes."] : []),
		...(data?.tracked === false ? ["The current branch is not tracked by Graphite."] : []),
		...(data !== undefined && data.slotConflicts.length > 0
			? [`The downstack restack scope has ${data.slotConflicts.length} Slot conflict(s).`]
			: []),
	];
	return [...reasons, message, "Not starting gt restack."].join("\n\n");
}
