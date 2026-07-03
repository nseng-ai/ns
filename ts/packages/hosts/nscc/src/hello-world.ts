export interface JiccHelloWorldModel {
	readonly title: string;
	readonly body: string;
	readonly footer: string;
}

export function buildHelloWorldModel(): JiccHelloWorldModel {
	return {
		title: "Hello from nscc",
		body: "OpenTUI core is ready for future command-and-control workflows.",
		footer: "Press q or Ctrl-C to exit",
	};
}
