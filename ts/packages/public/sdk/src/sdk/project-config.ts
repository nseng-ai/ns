import type { ZodType } from "zod";

export interface ProjectSetting<T = unknown> {
	readonly path: readonly [string, ...string[]];
	readonly schema: ZodType<T>;
	readonly invalidMessage?: (context: { pathLabel: string }) => string;
}

export type SettingsSchema<T = unknown> = ProjectSetting<T>;

export interface ProjectConfigDiagnostic {
	severity: "error" | "info";
	code: string;
	message: string;
	path?: string;
	causeMessage?: string;
}

export interface EffectiveValue<T> {
	readonly value: T;
	readonly provenance: {
		readonly source: "project";
		readonly path: string;
		readonly settingPath: readonly [string, ...string[]];
	};
}

export type ProjectConfigError =
	| { readonly code: "project-not-found"; readonly cwd: string }
	| { readonly code: "project-discovery-failed"; readonly cwd: string; readonly message: string }
	| { readonly code: "source-read-failed"; readonly path: string; readonly message: string }
	| {
			readonly code: "invalid-source";
			readonly path: string;
			readonly diagnostics: readonly ProjectConfigDiagnostic[];
	  }
	| {
			readonly code: "invalid-setting";
			readonly path: string;
			readonly settingPath: readonly [string, ...string[]];
			readonly message: string;
	  };

export interface EffectiveProjectConfig {
	get<T>(
		setting: ProjectSetting<T>,
	): Promise<
		| { readonly ok: true; readonly value: EffectiveValue<T> | undefined }
		| { readonly ok: false; readonly error: ProjectConfigError }
	>;
}
