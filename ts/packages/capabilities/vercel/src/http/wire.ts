import { z } from "zod";

export const DISPATCH_OIDC_HEADER_NAME = "x-ns-dispatch-oidc-token";
/** Vercel Deployment Protection automation bypass header (team-enforced SSO). */
export const VERCEL_PROTECTION_BYPASS_HEADER_NAME = "x-vercel-protection-bypass";
export const MINT_ROUTE_PATH = "/api/mint";
export const TRIGGER_ROUTE_PATH = "/api/trigger";
export const RUNS_ROUTE_PATH = "/api/runs";

export const triggerWorkflowValues = [
	"hello",
	"sandbox-probe",
	"supervision-probe",
	"dispatch",
] as const;

export const httpErrorSchema = z.strictObject({
	error: z.strictObject({ code: z.string(), message: z.string() }),
});

export const mintSuccessResponseSchema = z.strictObject({
	token: z.string().min(1),
	expiresAt: z.string().min(1),
	repository: z.string().min(1),
	purpose: z.literal("clone"),
});

export const triggerSuccessResponseSchema = z.strictObject({
	runId: z.string().min(1),
	workflow: z.enum(triggerWorkflowValues),
});

export const runStatusSuccessResponseSchema = z.strictObject({
	runId: z.string().min(1),
	status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
});

export function httpErrorBody<Code extends string>(code: Code, message: string) {
	return { error: { code, message } } as const;
}
