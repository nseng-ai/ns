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

export function formatHelpText(): string {
	return `Usage: sdlcc [--help] [--version]

Open a full-screen OpenTUI hello-world screen.

Commands:
  sdlcc                    Start the OpenTUI hello-world screen
  sdlcc --help             Show this help text
  sdlcc --version          Show the sdlcc version

Primary smoke test:
  bun ts/packages/sdlcc/src/cli.ts

Exit keys:
  q, Ctrl-C
`;
}

export function formatVersionText(): string {
	return "sdlcc 0.1.0";
}
