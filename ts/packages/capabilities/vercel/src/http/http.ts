export async function readJsonBody(
	request: Request,
): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false }> {
	try {
		return { ok: true, value: await request.json() };
	} catch {
		// Parser details are intentionally not exposed to callers.
		return { ok: false };
	}
}

export function jsonResponse(body: unknown, status: number): Response {
	return Response.json(body, {
		status,
		headers: { "Cache-Control": "no-store" },
	});
}
