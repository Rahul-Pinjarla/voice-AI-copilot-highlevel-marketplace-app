export function getTryNTimes(n: number) {
  return async function <T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= n; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (attempt < n) {
          console.warn(`[retry] attempt ${attempt}/${n} failed: ${(err as Error).message ?? err}`);
        }
      }
    }
    throw lastErr;
  };
}

export const try3Times = getTryNTimes(3);
