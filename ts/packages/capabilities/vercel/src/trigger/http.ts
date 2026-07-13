// Small HTTP plumbing shared by the trigger/observe route entrypoints.

export async function readJsonBody(
	request: Request,
): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false }> {
	try {
		return { ok: true, value: await request.json() };
	} catch {
		return { ok: false };
	}
}

export function jsonResponse(body: unknown, status: number): Response {
	return Response.json(body, {
		status,
		headers: { "Cache-Control": "no-store" },
	});
}
