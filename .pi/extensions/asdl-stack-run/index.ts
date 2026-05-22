import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function asdlStackRunExtension(_pi: ExtensionAPI): void {
	// Command and tool registration land in later slices. Keeping the extension
	// loadable here lets Pi auto-discover the project-local package immediately.
}
