import type {
	ExtensionAPI as PiExtensionAPI,
	ExtensionFactory,
} from "@earendil-works/pi-coding-agent";

import registerStackViewExtension, {
	stackViewParity,
	type StackViewExtensionAPI,
} from "../stack-view/extension.ts";

/** Pi-host adapter for Flow's deliberately narrowed stack-view extension contract. */
const registerStackViewExtensionForHost: ExtensionFactory = (pi: PiExtensionAPI) => {
	// Pi's renderer API is generic while stack-view accepts only its own custom
	// message. The runtime host supplies the compatible API; keep this variance
	// assertion at the host boundary rather than widening the feature contract.
	registerStackViewExtension(pi as StackViewExtensionAPI);
};

export function createStandaloneStackViewExtension(): ExtensionFactory {
	return (pi: PiExtensionAPI) => {
		registerStackViewExtension(pi as StackViewExtensionAPI, {
			presentation: "standalone-fullscreen",
		});
	};
}

export default registerStackViewExtensionForHost;
export { registerStackViewExtensionForHost as registerStackViewExtension, stackViewParity };
