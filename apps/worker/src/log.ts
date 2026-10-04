export function log(message: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
}

export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  log(`${label}…`);
  const result = await fn();
  log(`${label} done in ${((performance.now() - start) / 1000).toFixed(1)}s`);
  return result;
}
