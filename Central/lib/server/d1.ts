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

function normalizeValue(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeValue(entry)]),
    );
  }
  return value;
}

async function execute<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
  try {
    const rows = await getClient().unsafe(postgresSql(sql), params as any[]);
    return {
      success: true,
      results: (rows as unknown[]).map((row) => normalizeValue(row) as T),
    };
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

      // Vehicle inspection module. The module is intentionally isolated from
      // freight_sales so it can later be linked to existing freight orders
      // without changing the financial model.
      await db.unsafe(`create table if not exists inspection_vehicles (
        id text primary key not null,
        client_id text references clients(id) on delete set null,
        plate text not null,
        chassis text,
        renavam text,
        brand text,
        model text,
        version text,
        manufacture_year integer,
        model_year integer,
        color text,
        current_mileage integer,
        fuel_level integer,
        notes text,
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      )`);
      await db.unsafe("create index if not exists inspection_vehicles_plate_idx on inspection_vehicles (plate)");
      await db.unsafe("create index if not exists inspection_vehicles_client_idx on inspection_vehicles (client_id)");

      await db.unsafe(`create table if not exists inspection_orders (
        id text primary key not null,
        order_number text not null,
        client_id text references clients(id) on delete set null,
        vehicle_id text not null references inspection_vehicles(id) on delete restrict,
        origin text not null,
        destination text not null,
        transport_company text,
        driver_name text,
        carrier_plate text,
        status text not null default 'AGUARDANDO_COLETA',
        planned_pickup_at text,
        pickup_at text,
        planned_delivery_at text,
        delivered_at text,
        notes text,
        created_by text references users(id) on delete set null,
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp,
        constraint inspection_orders_status_check check (status in ('RASCUNHO','AGUARDANDO_COLETA','EM_COLETA','PATIO_ORIGEM','EM_TRANSITO','PATIO_DESTINO','AGUARDANDO_ENTREGA','ENTREGUE','ENCERRADA','CANCELADA','OCORRENCIA'))
      )`);
      await db.unsafe("create unique index if not exists inspection_orders_number_unique on inspection_orders (order_number)");
      await db.unsafe("create index if not exists inspection_orders_status_idx on inspection_orders (status)");
      await db.unsafe("create index if not exists inspection_orders_vehicle_idx on inspection_orders (vehicle_id)");
      await db.unsafe("create index if not exists inspection_orders_client_idx on inspection_orders (client_id)");

      await db.unsafe(`create table if not exists inspections (
        id text primary key not null,
        order_id text not null references inspection_orders(id) on delete cascade,
        type text not null,
        status text not null default 'EM_ANDAMENTO',
        responsible_user_id text references users(id) on delete set null,
        mileage integer,
        fuel_level integer,
        observations text,
        latitude numeric,
        longitude numeric,
        started_at text not null default current_timestamp,
        completed_at text,
        constraint inspections_type_check check (type in ('COLETA','PATIO_ORIGEM','PATIO_DESTINO','ENTREGA_FINAL')),
        constraint inspections_status_check check (status in ('EM_ANDAMENTO','CONCLUIDA','CANCELADA'))
      )`);
      await db.unsafe("create index if not exists inspections_order_idx on inspections (order_id, type)");

      await db.unsafe(`create table if not exists inspection_items (
        id text primary key not null,
        inspection_id text not null references inspections(id) on delete cascade,
        category text not null,
        item text not null,
        status text not null default 'NAO_CONFERIDO',
        observation text,
        created_at text not null default current_timestamp,
        constraint inspection_items_status_check check (status in ('OK','AVARIA','NAO_APLICAVEL','NAO_CONFERIDO'))
      )`);
      await db.unsafe("create index if not exists inspection_items_inspection_idx on inspection_items (inspection_id)");

      await db.unsafe(`create table if not exists inspection_damages (
        id text primary key not null,
        inspection_id text not null references inspections(id) on delete cascade,
        type text not null,
        category text,
        description text not null,
        location text,
        position_x numeric,
        position_y numeric,
        severity text not null default 'LEVE',
        created_by text references users(id) on delete set null,
        created_at text not null default current_timestamp,
        constraint inspection_damages_severity_check check (severity in ('LEVE','MEDIA','GRAVE'))
      )`);
      await db.unsafe("create index if not exists inspection_damages_inspection_idx on inspection_damages (inspection_id)");

      await db.unsafe(`create table if not exists inspection_photos (
        id text primary key not null,
        inspection_id text not null references inspections(id) on delete cascade,
        damage_id text references inspection_damages(id) on delete set null,
        storage_path text not null,
        file_name text not null,
        photo_type text not null,
        latitude numeric,
        longitude numeric,
        created_by text references users(id) on delete set null,
        created_at text not null default current_timestamp
      )`);
      await db.unsafe("create index if not exists inspection_photos_inspection_idx on inspection_photos (inspection_id, created_at)");

      await db.unsafe(`create table if not exists inspection_signatures (
        id text primary key not null,
        inspection_id text not null references inspections(id) on delete cascade,
        name text not null,
        document text,
        signature_path text not null,
        latitude numeric,
        longitude numeric,
        signed_at text not null default current_timestamp
      )`);
      await db.unsafe("create index if not exists inspection_signatures_inspection_idx on inspection_signatures (inspection_id)");

      await db.unsafe(`create table if not exists inspection_events (
        id text primary key not null,
        order_id text not null references inspection_orders(id) on delete cascade,
        event_type text not null,
        description text not null,
        user_id text references users(id) on delete set null,
        metadata text,
        created_at text not null default current_timestamp
      )`);
      await db.unsafe("create index if not exists inspection_events_order_idx on inspection_events (order_id, created_at)");
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
      method: "POST",
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
