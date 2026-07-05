export interface NsccHelloWorldModel {
	readonly title: string;
	readonly body: string;
	readonly footer: string;
}

export function buildHelloWorldModel(): NsccHelloWorldModel {
	return {
		title: "Hello from nscc",
		body: "OpenTUI core is ready for future command-and-control workflows.",
		footer: "Press q or Ctrl-C to exit",
	};
}
