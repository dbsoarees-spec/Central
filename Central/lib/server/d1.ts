import postgres from "postgres";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type QueryResult<T = Record<string, unknown>> = {
  success: boolean;
  results: T[];
  meta?: Record<string, unknown>;
};

type Prepared = {
  bind: (...values: unknown[]) => Prepared;
  all: <T = Record<string, unknown>>() => Promise<QueryResult<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: <T = Record<string, unknown>>() => Promise<QueryResult<T>>;
};

type Database = {
  prepare: (query: string) => Prepared;
  batch: <T = Record<string, unknown>>(statements: Prepared[]) => Promise<QueryResult<T>[]>;
};

let client: ReturnType<typeof postgres> | null = null;
let schemaReady: Promise<void> | null = null;

function databaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new ApiError(
      503,
      "Banco de dados indisponível. Configure DATABASE_URL com a conexão PostgreSQL do projeto Central_FRETE.",
    );
  }
  return url;
}

function getClient() {
  if (!client) {
    client = postgres(databaseUrl(), {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: "require",
    });
  }
  return client;
}

function postgresSql(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function execute<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
  try {
    const rows = await getClient().unsafe(postgresSql(sql), params as any[]);
    return { success: true, results: rows as T[] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("central_frete_database_error", { message, sql });
    throw new ApiError(503, `Falha ao acessar o banco de dados: ${message}`);
  }
}

function prepared(query: string, params: unknown[] = []): Prepared {
  return {
    bind(...values: unknown[]) {
      return prepared(query, values);
    },
    async all<T = Record<string, unknown>>() {
      return execute<T>(query, params);
    },
    async first<T = Record<string, unknown>>() {
      const result = await execute<T>(query, params);
      return result.results[0] ?? null;
    },
    async run<T = Record<string, unknown>>() {
      return execute<T>(query, params);
    },
  };
}

async function ensureSchemaCompatibility() {
  if (!schemaReady) {
    schemaReady = (async () => {
      // The Central_FRETE schema is managed by the Supabase migration.
      // These additive changes keep older databases compatible without
      // importing any Cloudflare Worker/D1 runtime.
      const db = getClient();
      await db.unsafe("alter table users add column if not exists username text");
      await db.unsafe("alter table users add column if not exists password_salt text");
      await db.unsafe("alter table users add column if not exists password_hash text");
      await db.unsafe("alter table users add column if not exists pix_details text");
      await db.unsafe("create unique index if not exists users_username_unique on users (username)");
      await db.unsafe("alter table providers add column if not exists reference_name text");
      await db.unsafe("alter table providers add column if not exists yard_address text");
      await db.unsafe("alter table freight_sales add column if not exists operational_deadline_days integer");
      await db.unsafe("alter table freight_sales add column if not exists origin_yard_entry_date text");
      await db.unsafe("alter table freight_costs add column if not exists provider_slot integer");
      await db.unsafe("alter table freight_costs add column if not exists payment_status text default 'NAO_APLICAVEL'");
      await db.unsafe("alter table freight_costs add column if not exists paid_at text");
      await db.unsafe("alter table freight_costs add column if not exists paid_by text");
      await db.unsafe("alter table freight_costs add column if not exists pix_details text");
      await db.unsafe(`create table if not exists seller_commission_statuses (
        id text primary key not null,
        seller_name text not null,
        competency text not null,
        status text not null default 'EM_ABERTO',
        paid_at text,
        paid_by text references users(id) on delete set null,
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp,
        constraint seller_commission_statuses_status_check check (status in ('EM_ABERTO', 'PAGO'))
      )`);
      await db.unsafe("create unique index if not exists seller_commission_statuses_seller_competency_unique on seller_commission_statuses (seller_name, competency)");
      await db.unsafe("create index if not exists seller_commission_statuses_competency_idx on seller_commission_statuses (competency)");
      await db.unsafe("create index if not exists seller_commission_statuses_status_idx on seller_commission_statuses (status)");
      await db.unsafe(`create table if not exists seller_payment_profiles (
        seller_name text primary key not null,
        pix_details text,
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      )`);
      await db.unsafe(`create table if not exists sale_attachments (
        id text primary key not null,
        sale_id text not null references freight_sales(id) on delete cascade,
        storage_key text not null unique,
        file_name text not null,
        mime_type text not null,
        size_bytes integer not null,
        description text,
        uploaded_by text references users(id) on delete set null,
        uploaded_at text not null default current_timestamp,
        constraint sale_attachments_size_check check (size_bytes > 0)
      )`);
      await db.unsafe("create index if not exists sale_attachments_sale_idx on sale_attachments (sale_id, uploaded_at)");
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export async function getD1(): Promise<Database> {
  await ensureSchemaCompatibility();
  return {
    prepare: (query: string) => prepared(query),
    batch: async <T = Record<string, unknown>>(statements: Prepared[]) => {
      const results: QueryResult<T>[] = [];
      for (const statement of statements) {
        results.push(await statement.run<T>());
      }
      return results;
    },
  };
}

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "central-frete";

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new ApiError(
      503,
      "Armazenamento indisponível. Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

function storageUrl(path: string) {
  const { url } = supabaseConfig();
  return `${url}/storage/v1/object/${encodeURIComponent(STORAGE_BUCKET)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

class SupabaseStorageObject {
  constructor(
    public readonly body: ReadableStream<Uint8Array>,
    private readonly contentType: string | null,
  ) {}

  writeHttpMetadata(headers: Headers) {
    if (this.contentType) headers.set("content-type", this.contentType);
  }
}

class SupabaseStorageBucket {
  async put(path: string, body: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) {
    const { key } = supabaseConfig();
    const response = await fetch(storageUrl(path), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": options?.httpMetadata?.contentType || "application/octet-stream",
        "x-upsert": "false",
      },
      body,
    });
    if (!response.ok) {
      const message = await response.text();
      throw new ApiError(503, `Falha ao salvar comprovante no Supabase Storage: ${message}`);
    }
  }

  async get(path: string) {
    const { key } = supabaseConfig();
    const response = await fetch(storageUrl(path), {
      headers: { Authorization: `Bearer ${key}`, apikey: key },
      cache: "no-store",
    });
    if (response.status === 404) return null;
    if (!response.ok || !response.body) {
      throw new ApiError(503, "Falha ao ler comprovante no Supabase Storage.");
    }
    return new SupabaseStorageObject(response.body, response.headers.get("content-type"));
  }

  async delete(path: string) {
    const { url, key } = supabaseConfig();
    const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(STORAGE_BUCKET)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [path] }),
    });
    if (!response.ok && response.status !== 404) {
      throw new ApiError(503, "Falha ao remover comprovante do Supabase Storage.");
    }
  }
}

let bucket: SupabaseStorageBucket | null = null;

export async function getBucket() {
  bucket ??= new SupabaseStorageBucket();
  return bucket;
}

export async function queryAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await (await getD1()).prepare(sql).bind(...params).all<T>();
  if (!result.success) throw new ApiError(500, "Falha ao consultar os dados.");
  return result.results ?? [];
}

export async function queryFirst<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await getD1()).prepare(sql).bind(...params).first<T>();
}

export function jsonError(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: error.message, details: error.details ?? null },
      { status: error.status },
    );
  }
  console.error("central_frete_unhandled_error", error);
  return Response.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
}
