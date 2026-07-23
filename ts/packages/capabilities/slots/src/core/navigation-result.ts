import { z } from "zod";

import type { SlotCliContext } from "./context.ts";
import { writeCdDirectiveIfActive, type CdDirectiveResult } from "./shell/cd-directive.ts";

const clipboardNavigationResultSchema = z.object({
	worktreePath: z.string(),
	cdCommand: z.string(),
	clipboardCopied: z.boolean(),
	clipboardSkipped: z.boolean(),
	clipboardFailureReason: z
		.union([z.literal("backend-missing"), z.literal("subprocess-error")])
		.nullable(),
	clipboardFailureDetail: z.string().nullable(),
});

const cdDirectiveNavigationResultSchema = z.discriminatedUnion("cdDirectiveStatus", [
	z.object({
		cdDirectiveStatus: z.literal("inactive"),
		cdDirectivePath: z.string().nullable(),
		cdDirectiveFailureDetail: z.null(),
	}),
	z.object({
		cdDirectiveStatus: z.literal("written"),
		cdDirectivePath: z.string(),
		cdDirectiveFailureDetail: z.null(),
	}),
	z.object({
		cdDirectiveStatus: z.literal("failed"),
		cdDirectivePath: z.string(),
		cdDirectiveFailureDetail: z.string(),
	}),
]);

/** Canonical schema for the stable flat navigation wire fields and their legal combinations. */
export const navigationResultSchema = clipboardNavigationResultSchema.and(
	cdDirectiveNavigationResultSchema,
);

export type NavigationResultFields = z.infer<typeof navigationResultSchema>;

/**
 * Canonical side-effect contract for checkout navigation. The Capability API
 * (`api.ts`) re-exports this as `SlotCheckoutSideEffects`; both edges bind to
 * this single type so the two surfaces cannot drift.
 */
export interface CheckoutSideEffects {
	shouldCopyClipboard: boolean;
	shouldWriteCdDirective: boolean;
}

export async function prepareNavigation(
	ctx: SlotCliContext,
	worktreePath: string,
	sideEffects: CheckoutSideEffects,
): Promise<NavigationResultFields> {
	const cdDirectiveResult = await writeCdDirectiveIfActive(worktreePath, {
		env: ctx.env,
		isEnabled: sideEffects.shouldWriteCdDirective,
	});
	const navigation = await buildClipboardNavigationResultFields(
		ctx,
		worktreePath,
		sideEffects.shouldCopyClipboard,
	);
	return { ...navigation, ...flattenCdDirectiveResult(cdDirectiveResult) };
}

function flattenCdDirectiveResult(
	result: CdDirectiveResult,
): z.infer<typeof cdDirectiveNavigationResultSchema> {
	switch (result.status) {
		case "inactive":
			return {
				cdDirectiveStatus: "inactive",
				cdDirectivePath: result.path,
				cdDirectiveFailureDetail: null,
			};
		case "written":
			return {
				cdDirectiveStatus: "written",
				cdDirectivePath: result.path,
				cdDirectiveFailureDetail: null,
			};
		case "failed":
			return {
				cdDirectiveStatus: "failed",
				cdDirectivePath: result.path,
				cdDirectiveFailureDetail: result.error,
			};
	}
}

async function buildClipboardNavigationResultFields(
	ctx: SlotCliContext,
	worktreePath: string,
	shouldCopyClipboard: boolean,
): Promise<z.infer<typeof clipboardNavigationResultSchema>> {
	const cdCommand = `cd ${worktreePath}`;
	if (!shouldCopyClipboard) {
		return {
			worktreePath,
			cdCommand,
			clipboardCopied: false,
			clipboardSkipped: true,
			clipboardFailureReason: null,
			clipboardFailureDetail: null,
		};
	}
	const copyResult = await ctx.clipboard.copy(cdCommand);
	if (copyResult.type === "copied") {
		return {
			worktreePath,
			cdCommand,
			clipboardCopied: true,
			clipboardSkipped: false,
			clipboardFailureReason: null,
			clipboardFailureDetail: null,
		};
	}
	return {
		worktreePath,
		cdCommand,
		clipboardCopied: false,
		clipboardSkipped: false,
		clipboardFailureReason: copyResult.reason,
		clipboardFailureDetail: copyResult.detail,
	};
}
