import { dim, glyph, renderBufferedReport, resolveThemeCaps } from "@nseng-ai/foundation/cli-theme";
import { commandIoFromNsExtensionApi, runWithNsCommandIo } from "@nseng-ai/sdk/command-io";
import { type Caps } from "@nseng-ai/clinkr";
import { renderCapabilitiesForTerminal } from "@nseng-ai/clinkr/legacy";
import { defineCommand, failure, ok, z, type NsCommand } from "@nseng-ai/sdk";
import { prepareFlowChangesSummary } from "../model-generation.ts";
import { MODEL_OPERATION_IDS } from "@nseng-ai/extension-kit/model-policy";
import { resolveFlowModelSelection } from "../model-policy.ts";
import {
	isGitPorcelainUnmergedStatus,
	parseGitPorcelainStatusOutput,
	type GitPorcelainStatus,
	type GitPorcelainStatusLine,
} from "../../changes/git-porcelain.ts";
import { formatPendingWorktreeError } from "../../autobranch/pending-worktree-format.ts";
import { FLOW_COMMAND_FAILED } from "../flow-cli-runner.ts";
import { loadFlowPendingWorktreeSnapshot } from "../worktree.ts";

// This project-local extension uses the public ns SDK plus internal migration
// exports while duplicated workflow helpers move into package-owned modules.
const changesResultSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("clean"), branch: z.string() }),
	z.object({
		type: z.literal("outstanding"),
		branch: z.string(),
		summaryText: z.string(),
		suggestedSlug: z.string(),
		files: z.array(
			z.object({
				status: z.object({ raw: z.string(), index: z.string(), worktree: z.string() }),
				path: z.string(),
			}),
		),
	}),
]);

const MAX_DISPLAY_FILE_LINES = 50;

const GIT_STATUS_LABEL_CODES = ["R", "C", "A", "D", "M"] as const;
type GitStatusLabelCode = (typeof GIT_STATUS_LABEL_CODES)[number];

const GIT_STATUS_LABELS = {
	R: "renamed",
	C: "copied",
	A: "added",
	D: "deleted",
	M: "modified",
} satisfies Readonly<Record<GitStatusLabelCode, string>>;

export const flowChangesCommand: NsCommand = defineCommand({
	schema: z.object({}),
	resultSchema: changesResultSchema,
	renderHuman: (result, caps) => {
		if (result.type === "clean") return "Working tree is clean; no outstanding changes.";
		return formatOutstandingChangesMessage({
			terminalCaps: resolveThemeCaps(caps),
			branch: result.branch,
			files: result.files,
			summaryText: result.summaryText,
			suggestedSlug: result.suggestedSlug,
		});
	},
	handler: async (ctx) => {
		const io = commandIoFromNsExtensionApi(ctx);
		return await runWithNsCommandIo(io, async (io) => {
			io.phase("Inspecting worktree…");
			const loaded = await loadFlowPendingWorktreeSnapshot(ctx);
			if (!loaded.ok) {
				return failure(FLOW_COMMAND_FAILED, formatPendingWorktreeError(loaded.error));
			}

			const snapshot = loaded.snapshot;
			if (snapshot.clean) return ok({ type: "clean" as const, branch: snapshot.branch });

			io.phase("Resolving changes model policy…");
			const model = await resolveFlowModelSelection(ctx, MODEL_OPERATION_IDS.flowChanges);
			if (!model.ok) return failure(FLOW_COMMAND_FAILED, model.error);
			io.phase("Generating changes summary…");
			const summary = await prepareFlowChangesSummary(
				{ ...ctx, modelSelection: model.modelSelection },
				snapshot,
			);
			if (!summary.ok) {
				return failure(FLOW_COMMAND_FAILED, summary.error);
			}

			return ok({
				type: "outstanding" as const,
				branch: snapshot.branch,
				summaryText: summary.summaryText,
				suggestedSlug: summary.suggestedSlug,
				files: parseGitPorcelainStatusOutput(snapshot.status),
			});
		});
	},
});

export default flowChangesCommand;

interface FormatOutstandingChangesMessageOptions {
	terminalCaps: Caps;
	branch: string;
	files: readonly GitPorcelainStatusLine[];
	summaryText: string;
	suggestedSlug: string;
}

function formatOutstandingChangesMessage(options: FormatOutstandingChangesMessageOptions): string {
	return renderBufferedReport({
		caps: renderCapabilitiesForTerminal(options.terminalCaps),
		title: `Outstanding changes on ${options.branch}`,
		sections: [
			{
				title: `Summary (${options.suggestedSlug}):`,
				lines: summaryLines(options.terminalCaps, options.summaryText),
			},
			{ title: "Files", lines: displayFileLines(options.terminalCaps, options.files) },
		],
	});
}

function summaryLines(terminalCaps: Caps, summaryText: string): string[] {
	return summaryText
		.trim()
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => bulletLine(terminalCaps, line.replace(/^-\s+/, "")));
}

function displayFileLines(
	terminalCaps: Caps,
	fileLines: readonly GitPorcelainStatusLine[],
): string[] {
	if (fileLines.length === 0) {
		return ["(no status lines)"];
	}

	const displayed = fileLines
		.slice(0, MAX_DISPLAY_FILE_LINES)
		.map((line) => formatStatusFileLine(terminalCaps, line));
	const omitted = fileLines.length - displayed.length;
	if (omitted > 0) {
		displayed.push(dim(`… ${omitted} more file(s)`));
	}
	return displayed;
}

function formatStatusFileLine(terminalCaps: Caps, line: GitPorcelainStatusLine): string {
	return bulletLine(terminalCaps, `${statusLabel(line.status).padEnd(10)} ${line.path}`);
}

function bulletLine(terminalCaps: Caps, text: string): string {
	return `${glyph(terminalCaps, "bullet")} ${text}`;
}

function statusLabel(status: GitPorcelainStatus): string {
	if (isGitPorcelainUnmergedStatus(status)) return "unmerged";
	if (status.index === "?" && status.worktree === "?") return "untracked";

	const indexLabel = statusCodeLabel(status.index);
	if (indexLabel !== undefined) return indexLabel;

	const worktreeLabel = statusCodeLabel(status.worktree);
	if (worktreeLabel !== undefined) return worktreeLabel;

	const trimmedStatus = status.raw.trim();
	return trimmedStatus.length > 0 ? trimmedStatus : "changed";
}

function statusCodeLabel(code: string): string | undefined {
	if (!isGitStatusLabelCode(code)) return undefined;
	return GIT_STATUS_LABELS[code];
}

function isGitStatusLabelCode(code: string): code is GitStatusLabelCode {
	return GIT_STATUS_LABEL_CODES.some((knownCode) => knownCode === code);
}
