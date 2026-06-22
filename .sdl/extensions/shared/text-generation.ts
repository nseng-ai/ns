const DEFAULT_FAST_MODEL_REF = "openai-codex/gpt-5.4-mini";

export const DEFAULT_CHECKPOINT_MODEL_REF = DEFAULT_FAST_MODEL_REF;
export const DEFAULT_CHANGES_MODEL_REF = DEFAULT_FAST_MODEL_REF;
export const CHECKPOINT_MODEL_ENV = "SDL_CHECKPOINT_MODEL";
export const LEGACY_CHECKPOINT_MODEL_ENV = "SDL_DEV_CHECKPOINT_MODEL";
export const CHANGES_MODEL_ENV = "SDL_CHANGES_MODEL";
export const LEGACY_CHANGES_MODEL_ENV = "PI_DRAFT_MODEL";

export function selectCheckpointModelRef(env: Record<string, string | undefined>): string {
  return (
    firstEnvValue(env, CHECKPOINT_MODEL_ENV, LEGACY_CHECKPOINT_MODEL_ENV) ??
    DEFAULT_CHECKPOINT_MODEL_REF
  );
}

export function selectChangesModelRef(env: Record<string, string | undefined>): string {
  return firstEnvValue(env, CHANGES_MODEL_ENV, LEGACY_CHANGES_MODEL_ENV) ?? DEFAULT_CHANGES_MODEL_REF;
}

function firstEnvValue(
  env: Record<string, string | undefined>,
  ...envNames: string[]
): string | undefined {
  for (const envName of envNames) {
    const value = env[envName]?.trim();
    if (value !== undefined && value !== "") {
      return value;
    }
  }
  return undefined;
}
