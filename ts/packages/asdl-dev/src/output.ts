import type { FailurePayload, SuccessPayload } from "./deployment-lookup.ts";

export function formatJson(payload: SuccessPayload | FailurePayload): string {
	return `${JSON.stringify(payload, null, 2)}\n`;
}

export function formatHumanSuccess(payload: SuccessPayload): string {
	const lines = [
		`Latest branch deployment for ${payload.branch}:`,
		`Preview URL: ${payload.preview_url}`,
		`Deployment URL: ${payload.deployment_url}`,
		`Vercel dashboard: ${payload.dashboard_url}`,
	];
	if (payload.deployment.pr_number !== undefined) {
		lines.push(`PR: #${payload.deployment.pr_number}`);
	}
	if (payload.deployment.commit_sha !== undefined) {
		lines.push(`Commit: ${payload.deployment.commit_sha}`);
	}
	if (payload.warnings.length > 0) {
		lines.push("Warnings:");
		for (const warning of payload.warnings) {
			lines.push(`- ${warning}`);
		}
	}
	return `${lines.join("\n")}\n`;
}

export function formatHumanFailure(payload: FailurePayload): string {
	const lines = [`Error: ${payload.error.message}`];
	if (payload.warnings !== undefined && payload.warnings.length > 0) {
		lines.push("Warnings:");
		for (const warning of payload.warnings) {
			lines.push(`- ${warning}`);
		}
	}
	return `${lines.join("\n")}\n`;
}
