type Runtime = { flush: () => Promise<void>; stop: () => Promise<void> };
const runtimes = new Map<string, Set<Runtime>>();
export function registerRuntime(userId: string, runtime: Runtime) {
  const entries = runtimes.get(userId) ?? new Set<Runtime>();
  entries.add(runtime);
  runtimes.set(userId, entries);
  return () => {
    entries.delete(runtime);
    if (!entries.size) runtimes.delete(userId);
  };
}
export async function flushAccount(userId: string) {
  await Promise.all([...(runtimes.get(userId) ?? [])].map((runtime) => runtime.flush()));
}
export async function stopAccount(userId: string) {
  await Promise.all([...(runtimes.get(userId) ?? [])].map((runtime) => runtime.stop()));
}
