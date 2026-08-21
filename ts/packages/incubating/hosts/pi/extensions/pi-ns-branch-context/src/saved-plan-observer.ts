import { z } from "zod";

import {
	resolvePlanStoreDirectory,
	SAVED_PLAN_SESSION_ENTRY_TYPE,
	saveSavedPlanResultSchema,
	validateSessionSavedPlanCandidate,
	type SavedPlanFileEvidence,
} from "@nseng-ai/plans/api";
import { resolvePlanStoreRootOption } from "./options.ts";
import type { BranchContextExtensionOptions } from "./host-types.ts";
import type { BranchContextPiCommandApi } from "./pi-command-api.ts";

const saveEnvelopeSchema = z.object({
	status: z.literal("ok"),
	exitCode: z.literal(0),
	data: saveSavedPlanResultSchema,
});

interface ToolStartEvent {
	toolCallId: string;
	toolName: string;
	args: unknown;
}

interface ToolEndEvent {
	toolCallId: string;
	toolName: string;
	result: unknown;
	isError: boolean;
}

interface ObserverState {
	cwd: string;
	commands: Map<string, string>;
	candidates: SavedPlanFileEvidence[];
	invalidReason?: string;
}

export interface SavedPlanObserver {
	arm(cwd: string): void;
	disarm(): void;
}

export function registerSavedPlanObserver(
	pi: BranchContextPiCommandApi,
	options: BranchContextExtensionOptions,
): SavedPlanObserver {
	let state: ObserverState | undefined;

	pi.on?.("tool_execution_start", (rawEvent) => {
		const event = parseToolStartEvent(rawEvent);
		if (state === undefined || event === undefined || event.toolName !== "bash") return;
		const command = readBashCommand(event.args);
		if (command !== undefined) state.commands.set(event.toolCallId, command);
	});
	pi.on?.("tool_execution_end", async (rawEvent, ctx) => {
		const active = state;
		const event = parseToolEndEvent(rawEvent);
		if (active === undefined || event === undefined || event.toolName !== "bash") return;
		const command = active.commands.get(event.toolCallId);
		active.commands.delete(event.toolCallId);
		if (command === undefined || !isStandaloneSavedPlanSaveCommand(command)) return;
		if (ctx.cwd !== active.cwd || event.isError) {
			active.invalidReason = "Saved Plan save did not complete successfully in the armed cwd.";
			return;
		}
		const output = readCompleteTextResult(event.result);
		if (output === undefined) {
			active.invalidReason = "Saved Plan save output was unavailable or truncated.";
			return;
		}
		const parsed = parseSaveEnvelope(output);
		if (parsed === undefined) {
			active.invalidReason = "Saved Plan save returned malformed structured output.";
			return;
		}
		const { provider: _provider, model: _model, summary, ...requiredEvidence } = parsed.data;
		const evidence: SavedPlanFileEvidence = {
			...requiredEvidence,
			...(summary === undefined ? {} : { summary }),
		};
		try {
			const planStoreRoot = resolvePlanStoreRootOption(options);
			const directory = await resolvePlanStoreDirectory(pi, {
				cwd: active.cwd,
				...(planStoreRoot === undefined ? {} : { planStoreRoot }),
			});
			const validation = await validateSessionSavedPlanCandidate(evidence, directory);
			if (validation.type !== "valid") {
				active.invalidReason =
					validation.type === "unsafe" ? validation.message : validation.reason;
				return;
			}
			active.candidates.push(evidence);
		} catch (error) {
			active.invalidReason = `Saved Plan evidence validation failed: ${error instanceof Error ? error.message : String(error)}`;
		}
	});
	pi.on?.("agent_settled", (_event, ctx) => {
		const active = state;
		state = undefined;
		if (active === undefined) return;
		if (active.invalidReason !== undefined || active.candidates.length !== 1) {
			if (ctx.hasUI) {
				ctx.ui.notify(
					active.invalidReason ??
						(active.candidates.length > 1
							? "Multiple Saved Plan save results were observed; no session evidence was recorded."
							: "No valid Saved Plan save result was observed; no session evidence was recorded."),
					"warning",
				);
			}
			return;
		}
		pi.appendEntry?.(SAVED_PLAN_SESSION_ENTRY_TYPE, active.candidates[0]);
	});
	// Pi has no explicit agent-abort extension event. agent_settled clears aborted
	// runs after retry/continuation processing; session_shutdown covers teardown.
	pi.on?.("session_shutdown", () => {
		state = undefined;
	});

	return {
		arm(cwd) {
			state = { cwd, commands: new Map(), candidates: [] };
		},
		disarm() {
			state = undefined;
		},
	};
}

function parseToolStartEvent(value: unknown): ToolStartEvent | undefined {
	const result = z
		.object({ toolCallId: z.string(), toolName: z.string(), args: z.unknown() })
		.safeParse(value);
	return result.success ? result.data : undefined;
}

function parseToolEndEvent(value: unknown): ToolEndEvent | undefined {
	const result = z
		.object({
			toolCallId: z.string(),
			toolName: z.string(),
			result: z.unknown(),
			isError: z.boolean(),
		})
		.safeParse(value);
	return result.success ? result.data : undefined;
}

function readBashCommand(args: unknown): string | undefined {
	const result = z.object({ command: z.string() }).safeParse(args);
	return result.success ? result.data.command.trim() : undefined;
}

function isStandaloneSavedPlanSaveCommand(command: string): boolean {
	const argv = tokenizeStandaloneCommand(command);
	if (argv === undefined || argv.length < 7) return false;
	if (argv[0] !== "enriched-plan" || argv[1] !== "exec" || argv[2] !== "save") return false;

	const options = new Map<string, string>();
	for (let index = 3; index < argv.length; index += 2) {
		const name = argv[index];
		const value = argv[index + 1];
		if (
			name === undefined ||
			value === undefined ||
			!(["--file", "--format", "--summary"] as const).includes(
				name as "--file" | "--format" | "--summary",
			) ||
			options.has(name)
		) {
			return false;
		}
		options.set(name, value);
	}
	return (
		options.get("--file") !== undefined &&
		options.get("--format") === "json" &&
		(options.size === 2 || (options.size === 3 && options.get("--summary") !== undefined))
	);
}

function tokenizeStandaloneCommand(command: string): string[] | undefined {
	const tokens: string[] = [];
	let token = "";
	let quote: "'" | '"' | undefined;
	let tokenStarted = false;
	for (const character of command.trim()) {
		if (quote !== undefined) {
			if (character === quote) quote = undefined;
			else token += character;
			tokenStarted = true;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			tokenStarted = true;
			continue;
		}
		if (/\s/u.test(character)) {
			if (tokenStarted) {
				tokens.push(token);
				token = "";
				tokenStarted = false;
			}
			continue;
		}
		if (";&|<>\\`$()".includes(character)) return undefined;
		token += character;
		tokenStarted = true;
	}
	if (quote !== undefined) return undefined;
	if (tokenStarted) tokens.push(token);
	return tokens;
}

function readCompleteTextResult(result: unknown): string | undefined {
	const parsed = z
		.object({
			content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
			details: z.object({ truncation: z.object({ truncated: z.boolean() }).optional() }).optional(),
		})
		.safeParse(result);
	if (!parsed.success || parsed.data.details?.truncation?.truncated === true) return undefined;
	return parsed.data.content.map((item) => item.text).join("\n");
}

function parseSaveEnvelope(output: string): z.infer<typeof saveEnvelopeSchema> | undefined {
	try {
		const result = saveEnvelopeSchema.safeParse(JSON.parse(output));
		return result.success ? result.data : undefined;
	} catch {
		return undefined;
	}
}
