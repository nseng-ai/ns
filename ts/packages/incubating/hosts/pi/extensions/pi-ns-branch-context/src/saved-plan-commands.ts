import { registerCommandWithImmediateAck } from "@nseng-ai/pi-runtime/commands/ack";
import { readFileSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";

import { RealGitGateway } from "@nseng-ai/foundation/git";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { loadPointCatalog, nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import {
	resolvePromptPointContent,
	type PromptPointContentReader,
} from "@nseng-ai/sdk/project-config/prompt-content";
import {
	WRITE_GRILLED_PLAN_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
} from "@nseng-ai/branch-context/api";
import { sendCommandProgressOrNotify } from "@nseng-ai/pi-runtime/commands/ack";
import { GRILL_ASK_TOOL_NAME, activateGrillAskTool } from "@nseng-ai/pi-runtime/grill/surfaces";
import type { CommandContext } from "./host-types.ts";
import type { BranchContextPiCommandApi } from "./pi-command-api.ts";

export {
	WRITE_GRILLED_PLAN_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
} from "@nseng-ai/branch-context/api";

const WRITE_PLAN_POINT_ID = "branch-context.plans-write";

export const DEFAULT_WRITE_PLAN_PROMPT_BODY = readFileSync(
	new URL("./prompts/plans-write-default.md", import.meta.url),
	"utf8",
).trimEnd();

type WritePlanPromptBodyResolution =
	| { type: "resolved"; body: string }
	| { type: "fallback"; body: string; warning: string };

export function buildWritePlanPrompt(
	steering: string,
	promptBody = DEFAULT_WRITE_PLAN_PROMPT_BODY,
): string {
	return `This is a /${WRITE_PLAN_COMMAND_NAME} request. Write a detailed implementation plan and save it in the local plan store.

${formatSteeringBlock(steering)}

${promptBody}`;
}

export function buildWriteGrilledPlanPrompt(steering: string): string {
	return `This is a /${WRITE_GRILLED_PLAN_COMMAND_NAME} request. Write a detailed implementation plan and save it in the local plan store after structured requirements grilling.

${formatSteeringBlock(steering)}

Plan audience and target inference:
- Treat the saved Markdown plan as self-contained context for a completely fresh downstream implementation session.
- User steering may be empty. Infer the planning target from explicit steering, nearby conversation/session context, and repository evidence, such as a just-produced objective summary or prototype plan.
- Inspect repository evidence before asking. Do not ask questions answerable from local files, docs, or commands.

Structured grilling contract:
- Use ${GRILL_ASK_TOOL_NAME} for every user-facing grilling question.
- Ask exactly one question per ${GRILL_ASK_TOOL_NAME} call.
- Each question must include 2–5 affirmative, mutually exclusive options and a recommendation with concise rationale.
- Frame each question and recommendation with uniform polarity: agreeing with the recommendation must be an affirmative answer — never a question whose recommended answer is "no" followed by "Do you agree?".
- Use up to 12 high-leverage questions. Some plans are simple and may not require any user-facing questions; stop early when requirements are resolved, and exceed that budget only if the user explicitly asks to continue.
- If ${GRILL_ASK_TOOL_NAME} is unavailable or returns ui_unavailable, stop, explain that structured grill UI is required, and summarize current status without saving.
- If ${GRILL_ASK_TOOL_NAME} returns status_request, provide a compact status report and re-ask the same pending question; do not count it as an answer.
- If ${GRILL_ASK_TOOL_NAME} returns end_grill, stop and summarize resolved decisions, unresolved branches, and the final recommendation without saving.

Save/no-save decision:
- If material requirements remain unresolved after the budget, stop, report blockers, and do not save. Material requirements include command surface, storage behavior, user-visible semantics, compatibility expectations, and irreversible migration or data-safety choices.
- Do not ask routine validation-scope or test-coverage questions. Ordinary validation coverage is the downstream implementation agent's responsibility, guided by project policy and changed-file judgment.
- If only non-blocking assumptions remain, fold them into the normal saved plan sections and proceed.
- Do not include a full Q&A transcript or special Q&A section in the saved plan.

Final plan requirements:
- Produce self-contained final Markdown with normal sections: goal/outcome, context/discovered facts, files/symbols/tests/docs, implementation steps, validation guidance, risks/assumptions/open questions, and review/remediation.
- Review the final Markdown for completeness before saving it.
- Create a temporary file with exactly \`mktemp "\${TMPDIR:-/tmp}/ns-saved-plan.XXXXXX"\` and retain the exact path returned by \`mktemp\`.
- Use the generic write tool to write the exact final Markdown content to that returned path.
- Safely shell-quote the exact path and invoke \`enriched-plan exec save --content-file '<exact path>' --format json\`.
- Treat the save as successful only when the command exits zero and stdout parses as a Clinkr success envelope with \`status: "ok"\` and complete saved-plan evidence in its \`data\` object: format, slug, filePath, fileName, fileStem, timestamp, timestampNumber, sequence, repoRoot, repoKey, repoIdentitySource, sourceBranch, branchKey, and directoryPath.
- Only after successful save evidence, run \`rm -- '<exact path>'\` for that exact temporary path. If cleanup fails, warn about cleanup and report the retained path, but do not invalidate the successful save.
- If any step before confirmed save success fails, do not remove the temporary file; retain and report its exact path, report the failure evidence, and stop. If \`mktemp\` failed before returning a path, report that no temporary path was allocated.
- Report the complete parsed saved-plan evidence and stop. Do not create Branch Context, start implementation, or write Branch Memory.`;
}

async function resolveWritePlanPromptBody(
	pi: BranchContextPiCommandApi,
	cwd: string,
): Promise<WritePlanPromptBodyResolution> {
	const repoRoot = await resolveGitRoot(new RealGitGateway(pi), cwd);
	if (repoRoot.type === "failed") {
		return fallbackWritePlanPromptBody(repoRoot.reason);
	}

	try {
		return await readWritePlanPromptBody(repoRoot.path);
	} catch (error) {
		return fallbackWritePlanPromptBody(
			`prompt point ${WRITE_PLAN_POINT_ID} could not be read: ${formatErrorMessage(error)}`,
		);
	}
}

function fallbackWritePlanPromptBody(reason: string): WritePlanPromptBodyResolution {
	return {
		type: "fallback",
		body: DEFAULT_WRITE_PLAN_PROMPT_BODY,
		warning: `Falling back to built-in /${WRITE_PLAN_COMMAND_NAME} prompt body because ${reason}`,
	};
}

async function resolveGitRoot(
	git: GitGateway,
	cwd: string,
): Promise<{ type: "resolved"; path: string } | { type: "failed"; reason: string }> {
	const result = await git.repoRoot({ cwd });
	if (!result.ok) {
		return { type: "failed", reason: result.error.message };
	}
	return { type: "resolved", path: result.value };
}

const branchContextPromptReader: PromptPointContentReader = {
	async readTextFile(path) {
		try {
			const stats = await lstat(path);
			if (stats.isSymbolicLink()) {
				return { ok: false, reason: "unreadable", message: "is a symlink" };
			}
			if (!stats.isFile()) {
				return { ok: false, reason: "unreadable", message: "is not a regular file" };
			}
			return { ok: true, content: await readFile(path, "utf8") };
		} catch (error) {
			const message = formatErrorMessage(error);
			if (isNodeFileNotFound(error)) return { ok: false, reason: "missing", message };
			return { ok: false, reason: "unreadable", message };
		}
	},
};

async function readWritePlanPromptBody(repoRoot: string): Promise<WritePlanPromptBodyResolution> {
	const catalog = loadPointCatalog({ repoRoot, gateway: nodeProjectConfigGateway });
	const resolved = await resolvePromptPointContent({
		repoRoot,
		catalog,
		pointId: WRITE_PLAN_POINT_ID,
		reader: branchContextPromptReader,
	});
	if (resolved.ok) return { type: "resolved", body: resolved.content };
	return fallbackWritePlanPromptBody(resolved.message);
}

function isNodeFileNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

export async function handleWritePlanCommand(
	pi: BranchContextPiCommandApi,
	args: string,
	ctx: CommandContext,
): Promise<void> {
	const steering = args.trim();
	sendCommandProgressOrNotify({
		host: pi,
		ctx,
		message: `Starting /${WRITE_PLAN_COMMAND_NAME} planning turn…`,
	});
	await ctx.waitForIdle();
	const promptBody = await resolveWritePlanPromptBody(pi, ctx.cwd);
	if (promptBody.type === "fallback" && ctx.hasUI) {
		ctx.ui.notify(promptBody.warning, "warning");
	}
	pi.sendUserMessage(buildWritePlanPrompt(steering, promptBody.body));
}

export async function handleWriteGrilledPlanCommand(
	pi: BranchContextPiCommandApi,
	args: string,
	ctx: CommandContext,
): Promise<void> {
	const steering = args.trim();
	sendCommandProgressOrNotify({
		host: pi,
		ctx,
		message: `Starting /${WRITE_GRILLED_PLAN_COMMAND_NAME} planning grill…`,
	});
	await ctx.waitForIdle();
	// The grilled prompt requires grill_ask; activate it (session-long, idempotent,
	// additive) so the first model request for this message sees the tool.
	activateGrillAskTool(pi);
	pi.sendUserMessage(buildWriteGrilledPlanPrompt(steering));
}

function formatSteeringBlock(steering: string): string {
	const trimmedSteering = steering.trim();
	if (!trimmedSteering) {
		return "User steering for this planning request: (none)";
	}

	return `User steering for this planning request:\n\n\`\`\`text\n${trimmedSteering}\n\`\`\``;
}

export function registerSavedPlanCommands(pi: BranchContextPiCommandApi): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: WRITE_PLAN_COMMAND_NAME,
		commandDefinition: {
			description: "Write and save a reviewed implementation plan in the local plan store.",
			handler: async (args, ctx) => handleWritePlanCommand(pi, args, ctx),
		},
	});

	registerCommandWithImmediateAck({
		host: pi,
		commandName: WRITE_GRILLED_PLAN_COMMAND_NAME,
		commandDefinition: {
			description: "Write and save a grilled implementation plan using structured requirements UI.",
			handler: async (args, ctx) => handleWriteGrilledPlanCommand(pi, args, ctx),
		},
	});
}
