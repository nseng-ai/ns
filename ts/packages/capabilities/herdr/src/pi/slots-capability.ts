import type { NsExtensionApi } from "@nseng-ai/sdk";

export type HerdrNsExtensionApiFactory = (cwd: string) => Promise<NsExtensionApi>;

export async function hasSlotsExtension(
	createNsExtensionApi: HerdrNsExtensionApiFactory,
	cwd: string,
): Promise<boolean> {
	const ns = await createNsExtensionApi(cwd);
	return ns.hasExtension("@nseng-ai/slots");
}
