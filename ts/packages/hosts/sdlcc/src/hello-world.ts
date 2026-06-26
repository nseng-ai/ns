export interface SdlccHelloWorldModel {
	readonly title: string;
	readonly body: string;
	readonly footer: string;
}

export function buildHelloWorldModel(): SdlccHelloWorldModel {
	return {
		title: "Hello from sdlcc",
		body: "OpenTUI core is ready for future command-and-control workflows.",
		footer: "Press q or Ctrl-C to exit",
	};
}
