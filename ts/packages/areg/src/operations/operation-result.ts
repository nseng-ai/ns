export type OperationResult<T> = { type: "ok"; value: T } | { type: "error"; message: string };
