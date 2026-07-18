import type { HasHerdrSlotsCapability } from "../core/slots-capability.ts";
import type { HerdrPiInvocationContext } from "./context.ts";

type GetHerdrNsContext = () => Promise<Pick<HerdrPiInvocationContext, "ns">>;

export function createHerdrSlotsCapabilityProbe(
	getContext: GetHerdrNsContext,
): HasHerdrSlotsCapability {
	return async () => {
		const context = await getContext();
		return context.ns?.hasExtension("@nseng-ai/slots") ?? false;
	};
}
