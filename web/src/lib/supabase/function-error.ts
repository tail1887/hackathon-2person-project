type FunctionErrorContext = {
  clone?: () => { json: () => Promise<unknown> };
};

type FunctionErrorBody = {
  error?: { message?: unknown };
};

export async function getFunctionErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: FunctionErrorContext } | null)?.context;
  if (!context?.clone) return fallback;

  const body = await context.clone().json().catch(() => undefined) as FunctionErrorBody | undefined;
  return typeof body?.error?.message === "string" ? body.error.message : fallback;
}
