export { buildCli, runCli, VERSION } from "./cli.ts";
export { generateSlotName, extractSlotNumber } from "./naming.ts";
export { buildSlotInventory, lowestAvailable } from "./inventory.ts";
export { discoverRepoOrSentinel, ensureSlotsMetadataDir } from "./repo-context.ts";
export {
	activeCdDirectivePath,
	writeCdDirectiveIfActive,
	SLOT_CD_DIRECTIVE_FILE,
} from "./shell/cd-directive.ts";
export { FakeClipboardGateway, RealClipboardGateway } from "./gateways/clipboard.ts";
export type { ClipboardCopyResult, ClipboardGateway } from "./gateways/clipboard.ts";
