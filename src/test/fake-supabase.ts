/**
 * Tiny in-memory stand-in for the Supabase service-role client, used by the
 * co-ownership approval-flow tests. It implements only the query-builder surface
 * `lib/shared-assets/server.ts` uses (select/insert/update/delete + eq/in/lt/order/
 * limit/single/maybeSingle, `rpc("profile_id_for_email")` and `auth.admin.*`).
 *
 * It is NOT Postgres: no RLS, constraints or triggers (column defaults for the
 * co-ownership tables are emulated in `DEFAULTS`). It exists so the real server
 * logic can run without a database; see approval-flow.test.ts for the limits.
 */
export type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null; count?: number | null };

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

const DEFAULTS: Record<string, () => Row> = {
  asset_change_requests: () => ({
    status: "pending",
    auto_approved: false,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    resolved_at: null,
  }),
  change_approvals: () => ({
    status: "pending",
    decided_at: null,
    created_at: new Date().toISOString(),
    notify_status: "not_sent",
    notified_at: null,
    notify_error: null,
  }),
  notifications: () => ({ read_at: null, asset_id: null, request_id: null, data: {}, created_at: new Date().toISOString() }),
  asset_owners: () => ({ invited_at: null, invite_status: "not_sent", invite_error: null }),
};

export type FakeUser = { id: string; email: string; email_confirmed_at?: string | null; last_sign_in_at?: string | null };

export class FakeDb {
  tables: Record<string, Row[]> = {};
  users: FakeUser[] = [];
  /** Tables that "do not exist" yet: any query on them returns PostgREST PGRST205 (migration not applied). */
  missingTables = new Set<string>();
  /** Tables whose queries THROW instead of returning an error (network failure, client bug). */
  throwingTables = new Set<string>();

  table(name: string): Row[] {
    return (this.tables[name] ??= []);
  }

  seed(name: string, rows: Row[]) {
    this.table(name).push(...rows.map((r) => ({ id: uuid(), ...(DEFAULTS[name]?.() ?? {}), ...r })));
  }

  client() {
    return {
      from: (name: string) => new Builder(this, name),
      rpc: async (fn: string, args: { p_email?: string }) => {
        if (fn !== "profile_id_for_email") return { data: null, error: { message: `unknown rpc ${fn}` } };
        const u = this.users.find((x) => x.email.toLowerCase() === String(args.p_email).toLowerCase());
        return { data: u?.id ?? null, error: null };
      },
      auth: {
        admin: {
          getUserById: async (id: string) => ({ data: { user: this.users.find((u) => u.id === id) ?? null }, error: null }),
          inviteUserByEmail: async () => ({ data: {}, error: null }),
          deleteUser: async (id: string) => {
            this.users = this.users.filter((u) => u.id !== id);
            return { data: {}, error: null };
          },
        },
      },
    };
  }
}

type Filter = (r: Row) => boolean;

class Builder implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private patch: Row = {};
  private inserted: Row[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private one: "single" | "maybe" | null = null;
  private head = false;
  private countMode = false;

  constructor(
    private db: FakeDb,
    private name: string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    // After insert/update, `.select()` just asks for the written rows back.
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    const list = Array.isArray(rows) ? rows : [rows];
    this.inserted = list.map((r) => ({ id: uuid(), ...(DEFAULTS[this.name]?.() ?? {}), ...r }));
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  is(col: string, v: null | boolean) {
    this.filters.push((r) => (v === null ? r[col] == null : r[col] === v));
    return this;
  }
  lt(col: string, v: string) {
    this.filters.push((r) => String(r[col]) < v);
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) {
    this.orderBy = { col, asc: o?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }

  private run(): Result {
    if (this.db.throwingTables.has(this.name)) throw new Error(`simulated failure on ${this.name}`);
    if (this.db.missingTables.has(this.name)) {
      return {
        data: null,
        error: { message: `Could not find the table 'public.${this.name}' in the schema cache`, code: "PGRST205" } as { message: string },
      };
    }
    const rows = this.db.table(this.name);
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[];
    if (this.op === "insert") {
      rows.push(...this.inserted);
      out = this.inserted;
    } else if (this.op === "update") {
      out = rows.filter(match);
      for (const r of out) Object.assign(r, this.patch);
    } else if (this.op === "delete") {
      out = rows.filter(match);
      this.db.tables[this.name] = rows.filter((r) => !match(r));
    } else {
      out = rows.filter(match);
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
    }
    if (this.max != null) out = out.slice(0, this.max);
    // Hand back copies so callers cannot mutate the "database" by accident.
    const copy = out.map((r) => structuredClone(r));
    if (this.head) return { data: null, error: null, count: copy.length };
    if (this.one) {
      if (copy.length === 0) return { data: null, error: this.one === "single" ? { message: "no rows" } : null };
      return { data: copy[0], error: null };
    }
    return { data: copy, error: null, count: this.countMode ? copy.length : null };
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
  }
}
