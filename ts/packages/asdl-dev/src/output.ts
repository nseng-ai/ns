import type { PreviewUrlFailurePayload, PreviewUrlPayload } from "./preview-url.ts";

export function formatJson(payload: PreviewUrlPayload): string {
	return `${JSON.stringify(payload)}\n`;
}

export function formatHumanFailure(payload: PreviewUrlFailurePayload): string {
	const lines = [`Error: ${payload.error.message}`];
	if (payload.warnings !== undefined && payload.warnings.length > 0) {
		lines.push("Warnings:");
		for (const warning of payload.warnings) {
			lines.push(`- ${warning}`);
		}
	}
	return `${lines.join("\n")}\n`;
}
