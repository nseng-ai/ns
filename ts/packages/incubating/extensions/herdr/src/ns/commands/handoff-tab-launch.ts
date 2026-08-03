import { buildPiLaunchCommand } from "@nseng-ai/extension-kit/pi-launch";
import { formatShellArg } from "@nseng-ai/foundation/exec";
import { checkHandoffArtifact, parseFlatHandoffSlug } from "@nseng-ai/handoffs/api";
import { defineCommand, failure, negative, ok, z } from "@nseng-ai/sdk";

import {
	formatHerdrHandoffTabLaunchSuccess,
	formatHerdrHandoffTabRunFailure,
	launchHerdrHandoffTab,
} from "../../core/handoff-tab.ts";
import { createNsHerdrHandoffTabContext } from "../context.ts";

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
	thinking: z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]),
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
	command: z.string(),
});

export const herdrHandoffTabLaunchCommand = defineCommand({
	schema: herdrHandoffTabLaunchRequestSchema,
	resultSchema: herdrHandoffTabLaunchResultSchema,
	renderHuman: (result) => formatHerdrHandoffTabLaunchSuccess({ type: "launched", ...result }),
	async handler(api, request) {
		const ctx = createNsHerdrHandoffTabContext(api);
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
			launchCommand: buildPiLaunchCommand(pickupCommand, {
				model: { provider: request.provider, id: request.model },
				thinkingLevel: request.thinking,
			}),
			workspaceId: request.workspaceId,
			slug: request.slug,
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
			command: launched.command,
		});
	},
});
