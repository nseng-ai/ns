export function GET(): Response {
	return Response.json({ service: "ns-dispatch", status: "ok" });
}
