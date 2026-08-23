import { formatShellArg } from "@nseng-ai/foundation/exec";
import { checkHandoffArtifact, parseFlatHandoffSlug } from "@nseng-ai/handoffs/api";
import { failure, negative, ok } from "@nseng-ai/sdk";
import { z } from "zod";

import { formatHerdrHandoffTabRunFailure, launchHerdrHandoffTab } from "../../core/handoff-tab.ts";
import { herdrNsCommand } from "../command.ts";

const thinkingLevelSchema = z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]);
const nonblankSchema = z.string().trim().min(1);
const flatSlugSchema = z.string().refine((value) => parseFlatHandoffSlug(value).type === "valid", {
	message: "slug must be flat and use lowercase letters, numbers, and single interior dashes only",
});

export const herdrHandoffTabLaunchRequestSchema = z.strictObject({
	branch: nonblankSchema,
	slug: flatSlugSchema,
	workspaceId: nonblankSchema,
	provider: nonblankSchema,
	model: nonblankSchema,
	thinking: thinkingLevelSchema,
});

export const herdrHandoffTabLaunchResultSchema = z.strictObject({
	branch: z.string(),
	slug: z.string(),
	key: z.string(),
	entryLocator: z.string(),
	workspaceId: z.string(),
	tabId: z.string(),
	rootPaneId: z.string(),
	label: z.string(),
	pickupCommand: z.string(),
	command: z.string(),
});

export const herdrHandoffTabLaunchNsCommand = herdrNsCommand({
	name: "launch",
	summary: "Launch a stored handoff in a focused Herdr tab.",
	description:
		"Verify a stored handoff reference, create a focused Herdr tab, and launch pickup in its root pane.",
	schema: herdrHandoffTabLaunchRequestSchema,
	resultSchema: herdrHandoffTabLaunchResultSchema,
	async handler(ctx, request) {
		const reference = { branch: request.branch, slug: request.slug };
		let checked;
		try {
			checked = await checkHandoffArtifact({ brmem: ctx.brmem }, reference);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return failure("handoff-verification-failed", message, {
				stage: "verify-handoff",
				...reference,
			});
		}
		if (checked.type === "error") {
			return failure("handoff-verification-failed", checked.error.message, {
				stage: "verify-handoff",
				...reference,
				code: checked.error.code,
			});
		}
		if (!checked.value.exists) {
			return negative(
				`No handoff ${request.slug} found on branch ${request.branch}; no Herdr tab was opened.`,
			);
		}

		const pickupCommand = `/ns:handoff:pickup --branch ${request.branch} ${request.slug}`;
		const launched = await launchHerdrHandoffTab({
			herdr: ctx.herdr,
			cwd: ctx.cwd,
			launchOptions: {
				model: { provider: request.provider, id: request.model },
				thinkingLevel: request.thinking,
			},
			workspaceId: request.workspaceId,
			slug: request.slug,
			pickupCommand,
		});
		if (launched.type === "failed") {
			const data = {
				stage: launched.stage,
				...reference,
				key: checked.value.key,
				entryLocator: checked.value.entryLocator,
				workspaceId: request.workspaceId,
				...(launched.stage === "run-in-pane"
					? {
							tabId: launched.tabId,
							rootPaneId: launched.rootPaneId,
							command: launched.command,
							manualRecoveryCommand: ["herdr", "pane", "run", launched.rootPaneId, launched.command]
								.map(formatShellArg)
								.join(" "),
						}
					: {}),
			};
			return failure(
				launched.stage === "create-tab" ? "herdr-tab-create-failed" : "herdr-pane-run-failed",
				launched.stage === "run-in-pane"
					? formatHerdrHandoffTabRunFailure(launched)
					: launched.message,
				data,
			);
		}

		return ok({
			...reference,
			key: checked.value.key,
			entryLocator: checked.value.entryLocator,
			workspaceId: launched.workspaceId,
			tabId: launched.tabId,
			rootPaneId: launched.rootPaneId,
			label: launched.label,
			pickupCommand,
			command: launched.command,
		});
	},
});

export default herdrHandoffTabLaunchNsCommand;
