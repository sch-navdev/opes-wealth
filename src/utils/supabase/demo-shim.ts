/**
 * Read-only wrapper for the demo user's server client: reads pass through; every
 * write (insert / update / upsert / delete, mutating rpc, storage upload / remove)
 * is swallowed and REPORTED AS A SUCCESS, so server actions carry on as if the save
 * worked and nothing reaches the database. The database refuses these writes anyway
 * (migration 0032); this just prevents error messages in the demo.
 *
 * A fake write answers the chained calls the app makes (`.select().single()` …) with
 * plausible data: the row that was sent (with a generated id) for an insert, the
 * values that were sent for an update.
 */
type WriteKind = "insert" | "update" | "upsert" | "delete";

function fakeWrite(kind: WriteKind, payload: unknown) {
  let single = false;
  let selected = false;
  const rows = Array.isArray(payload) ? payload : payload && typeof payload === "object" ? [payload] : [];

  const settle = () => {
    let data: unknown = null;
    if (kind === "insert" || kind === "upsert") {
      const made = (rows.length > 0 ? rows : [{}]).map((r) => ({ id: crypto.randomUUID(), ...(r as object) }));
      data = single ? made[0] : made;
    } else if (selected) {
      data = single ? { ...(rows[0] as object | undefined) } : rows.length > 0 ? rows : [{}];
    }
    return { data, error: null, count: null, status: kind === "insert" ? 201 : 200, statusText: "OK" };
  };

  const chain: unknown = new Proxy(() => chain, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(settle()).then(resolve, reject);
      }
      if (prop === "select") return () => ((selected = true), chain);
      if (prop === "single" || prop === "maybeSingle") return () => ((single = true), chain);
      return () => chain; // eq / in / match / returns / order / limit …
    },
    apply: () => chain,
  });
  return chain;
}

function fakeStorageBucket() {
  const ok = async () => ({ data: { path: "demo-mode" }, error: null });
  const removed = async () => ({ data: [], error: null });
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => (prop === "remove" ? removed : ok),
  });
}

const MUTATING_RPC = /^(revoke_|delete_|update_|set_)/;

export function withDemoReadOnly<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) => {
          const builder = (target as unknown as { from: (t: string) => Record<string, unknown> }).from(table);
          return new Proxy(builder, {
            get(b, method) {
              if (method === "insert" || method === "update" || method === "upsert") {
                return (payload: unknown) => fakeWrite(method, payload);
              }
              if (method === "delete") return () => fakeWrite("delete", null);
              const value = Reflect.get(b, method, b);
              return typeof value === "function" ? value.bind(b) : value;
            },
          });
        };
      }
      if (prop === "rpc") {
        return (name: string, ...args: unknown[]) => {
          if (MUTATING_RPC.test(name)) return fakeWrite("update", null);
          return (target as unknown as { rpc: (...a: unknown[]) => unknown }).rpc(name, ...args);
        };
      }
      if (prop === "storage") {
        const storage = Reflect.get(target, prop, target) as { from: (b: string) => unknown };
        return new Proxy(storage, {
          get(s, method) {
            if (method === "from") return () => fakeStorageBucket();
            const value = Reflect.get(s, method, s);
            return typeof value === "function" ? value.bind(s) : value;
          },
        });
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
