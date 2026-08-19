import initialMigrationSql from "@/drizzle/0000_graceful_beyonder.sql?raw";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

let schemaReady: Promise<void> | null = null;

function idempotentSchemaStatements() {
  return initialMigrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim().replace(/;$/, ""))
    .filter(Boolean)
    .map((statement) =>
      statement
        .replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ")
        .replace(
          /^CREATE UNIQUE INDEX\s+/i,
          "CREATE UNIQUE INDEX IF NOT EXISTS ",
        )
        .replace(/^CREATE INDEX\s+/i, "CREATE INDEX IF NOT EXISTS "),
    );
}

async function ensureSchema(database: D1Database) {
  if (!schemaReady) {
    schemaReady = database
      .batch(
        idempotentSchemaStatements().map((statement) =>
          database.prepare(statement),
        ),
      )
      .then(async () => {
        const userColumns = await database
          .prepare("pragma table_info(users)")
          .all<{ name: string }>();
        const userColumnNames = new Set(
          (userColumns.results ?? []).map((column) => column.name),
        );
        const userAdditions: D1PreparedStatement[] = [];
        if (!userColumnNames.has("username")) {
          userAdditions.push(database.prepare("alter table users add username text"));
        }
        if (!userColumnNames.has("password_salt")) {
          userAdditions.push(database.prepare("alter table users add password_salt text"));
        }
        if (!userColumnNames.has("password_hash")) {
          userAdditions.push(database.prepare("alter table users add password_hash text"));
        }
        if (!userColumnNames.has("pix_details")) {
          userAdditions.push(database.prepare("alter table users add pix_details text"));
        }
        if (userAdditions.length) await database.batch(userAdditions);
        await database.prepare(
          "create unique index if not exists users_username_unique on users (username)",
        ).run();

        const providerColumns = await database
          .prepare("pragma table_info(providers)")
          .all<{ name: string }>();
        const names = new Set(
          (providerColumns.results ?? []).map((column) => column.name),
        );
        const additiveStatements: D1PreparedStatement[] = [];
        if (!names.has("reference_name")) {
          additiveStatements.push(
            database.prepare("alter table providers add reference_name text"),
          );
        }
        if (!names.has("yard_address")) {
          additiveStatements.push(
            database.prepare("alter table providers add yard_address text"),
          );
        }
        if (additiveStatements.length) {
          await database.batch(additiveStatements);
        }
        const saleColumns = await database
          .prepare("pragma table_info(freight_sales)")
          .all<{ name: string }>();
        const saleColumnNames = new Set(
          (saleColumns.results ?? []).map((column) => column.name),
        );
        const saleAdditions: D1PreparedStatement[] = [];
        if (!saleColumnNames.has("operational_deadline_days")) {
          saleAdditions.push(
            database.prepare(
              "alter table freight_sales add operational_deadline_days integer",
            ),
          );
        }
        if (!saleColumnNames.has("origin_yard_entry_date")) {
          saleAdditions.push(
            database.prepare(
              "alter table freight_sales add origin_yard_entry_date text",
            ),
          );
        }
        if (saleAdditions.length) await database.batch(saleAdditions);
        const costColumns = await database
          .prepare("pragma table_info(freight_costs)")
          .all<{ name: string }>();
        const costColumnNames = new Set(
          (costColumns.results ?? []).map((column) => column.name),
        );
        const costAdditions: D1PreparedStatement[] = [];
        if (!costColumnNames.has("provider_slot")) {
          costAdditions.push(
            database.prepare("alter table freight_costs add provider_slot integer"),
          );
        }
        if (!costColumnNames.has("payment_status")) {
          costAdditions.push(
            database.prepare(
              "alter table freight_costs add payment_status text not null default 'NAO_APLICAVEL'",
            ),
          );
        }
        if (!costColumnNames.has("paid_at")) {
          costAdditions.push(
            database.prepare("alter table freight_costs add paid_at text"),
          );
        }
        if (!costColumnNames.has("paid_by")) {
          costAdditions.push(
            database.prepare("alter table freight_costs add paid_by text"),
          );
        }
        if (!costColumnNames.has("pix_details")) {
          costAdditions.push(
            database.prepare("alter table freight_costs add pix_details text"),
          );
        }
        if (costAdditions.length) await database.batch(costAdditions);
        await database.batch([
          database.prepare(
            `create table if not exists seller_commission_statuses (
              id text primary key not null,
              seller_name text not null,
              competency text not null,
              status text not null default 'EM_ABERTO',
              paid_at text,
              paid_by text references users(id) on delete set null,
              created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
              updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
              constraint seller_commission_statuses_status_check
                check (status in ('EM_ABERTO', 'PAGO'))
            )`,
          ),
          database.prepare(
            `create unique index if not exists
              seller_commission_statuses_seller_competency_unique
              on seller_commission_statuses (seller_name, competency)`,
          ),
          database.prepare(
            `create index if not exists seller_commission_statuses_competency_idx
              on seller_commission_statuses (competency)`,
          ),
          database.prepare(
            `create index if not exists seller_commission_statuses_status_idx
              on seller_commission_statuses (status)`,
          ),
          database.prepare(
            `create table if not exists seller_payment_profiles (
              seller_name text primary key not null,
              pix_details text,
              created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
              updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )`,
          ),
          database.prepare(
            `create table if not exists sale_attachments (
              id text primary key not null,
              sale_id text not null references freight_sales(id) on delete cascade,
              storage_key text not null unique,
              file_name text not null,
              mime_type text not null,
              size_bytes integer not null,
              description text,
              uploaded_by text references users(id) on delete set null,
              uploaded_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
              constraint sale_attachments_size_check check (size_bytes > 0)
            )`,
          ),
          database.prepare(
            "create index if not exists sale_attachments_sale_idx on sale_attachments (sale_id, uploaded_at)",
          ),
          database.prepare(
            "create index if not exists freight_costs_payment_status_idx on freight_costs (payment_status)",
          ),
        ]);
        await database.batch([
          database.prepare(
            `update freight_sales set operational_status = 'PÁTIO CENTRAL'
             where operational_status = 'BASE DF'`,
          ),
          database.prepare(
            `update freight_sales set operational_status = 'PÁTIO DE APOIO'
             where operational_status = 'EM PÁTIO'`,
          ),
          database.prepare(
            `update freight_sales set operational_status = 'CONFIRMAR'
             where operational_status in ('RASCUNHO', 'AGUARDANDO COLETA')`,
          ),
          database.prepare(
            `update freight_sales
             set legacy_operational_status = coalesce(legacy_operational_status, 'ENTREGUE'),
               operational_status = 'FINALIZADO'
             where operational_status = 'ENTREGUE'`,
          ),
        ]);
        const addressMigration = await database
          .prepare(
            `select id from audit_logs
             where entity_type = 'SCHEMA' and entity_id = 'client-address-company-v1'
             limit 1`,
          )
          .first<{ id: string }>();
        if (!addressMigration) {
          await database.batch([
            database.prepare(
              `update client_addresses set type = 'COBRANCA'
               where type = 'COLETA' and is_primary = 1 and client_id in (
                 select client_id from client_addresses
                 group by client_id having count(*) = 1
               )`,
            ),
            database
              .prepare(
                `insert into audit_logs (
                  id, entity_type, entity_id, action, actor_email, new_value
                ) values (?, 'SCHEMA', 'client-address-company-v1',
                  'MIGRATED', 'sistema@centralfrete.local', ?)`,
              )
              .bind(
                crypto.randomUUID(),
                JSON.stringify({
                  reason: "Endereços únicos do cadastro rápido anterior eram da empresa.",
                }),
              ),
          ]);
        }
        const providerPaymentMigration = await database
          .prepare(
            `select id from audit_logs
             where entity_type = 'SCHEMA' and entity_id = 'provider-cost-payment-v1'
             limit 1`,
          )
          .first<{ id: string }>();
        if (!providerPaymentMigration) {
          await database.batch([
            database.prepare(
              `with ranked as (
                select id,
                  row_number() over (
                    partition by sale_id order by created_at, id
                  ) as slot
                from freight_costs where category = 'PRESTADOR_SERVICO'
              )
              update freight_costs
              set provider_slot = (
                select case when ranked.slot <= 3 then ranked.slot else null end
                from ranked where ranked.id = freight_costs.id
              ), payment_status = 'EM_ABERTO', paid_at = null, paid_by = null
              where category = 'PRESTADOR_SERVICO'`,
            ),
            database.prepare(
              `update freight_costs set payment_status = 'NAO_APLICAVEL',
                provider_slot = null, paid_at = null, paid_by = null
               where category <> 'PRESTADOR_SERVICO'`,
            ),
            database
              .prepare(
                `insert into audit_logs (
                  id, entity_type, entity_id, action, actor_email, new_value
                ) values (?, 'SCHEMA', 'provider-cost-payment-v1',
                  'MIGRATED', 'sistema@centralfrete.local', ?)`,
              )
              .bind(
                crypto.randomUUID(),
                JSON.stringify({
                  reason: "Custos de prestadores separados da confirmação da margem.",
                  defaultStatus: "EM_ABERTO",
                }),
              ),
          ]);
        }
      })
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  await schemaReady;
}

type RenderD1Config = {
  accountId: string;
  databaseId: string;
  apiToken: string;
};

type D1ApiQueryResult<T = Record<string, unknown>> = {
  success: boolean;
  results?: T[];
  meta?: Record<string, unknown>;
};

function renderD1Config(): RenderD1Config | null {
  if (typeof process === "undefined") return null;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId && !databaseId && !apiToken) return null;
  if (!accountId || !databaseId || !apiToken) {
    throw new ApiError(
      503,
      "Configuração D1 incompleta. Defina CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID e CLOUDFLARE_API_TOKEN no Render.",
    );
  }
  return { accountId, databaseId, apiToken };
}

class RenderD1PreparedStatement implements D1PreparedStatement {
  private readonly params: unknown[];

  constructor(
    private readonly database: RenderD1Database,
    private readonly sql: string,
    params: unknown[] = [],
  ) {
    this.params = params;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new RenderD1PreparedStatement(this.database, this.sql, values);
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.database.query<T>(this.sql, this.params);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.all<T>();
    return result.results?.[0] ?? null;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.database.query<T>(this.sql, this.params);
  }

  getQuery() {
    return { sql: this.sql, params: this.params };
  }
}

class RenderD1Database implements D1Database {
  constructor(private readonly config: RenderD1Config) {}

  prepare(query: string): D1PreparedStatement {
    return new RenderD1PreparedStatement(this, query);
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<D1Result<T>> {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.config.accountId)}/d1/database/${encodeURIComponent(this.config.databaseId)}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql, params }),
        cache: "no-store",
      },
    );

    const payload = (await response.json()) as {
      success?: boolean;
      errors?: Array<{ message?: string }>;
      result?: Array<D1ApiQueryResult<T>>;
    };

    if (!response.ok || payload.success === false) {
      const message =
        payload.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
        `Cloudflare D1 respondeu HTTP ${response.status}.`;
      throw new ApiError(503, `Falha ao acessar o Cloudflare D1: ${message}`);
    }

    const result = payload.result?.[0];
    if (!result) {
      throw new ApiError(503, "Resposta inválida do Cloudflare D1.");
    }

    return {
      success: result.success !== false,
      results: result.results,
      meta: result.meta,
    };
  }

  async batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<Array<D1Result<T>>> {
    const queries = statements.map((statement) => {
      if (!(statement instanceof RenderD1PreparedStatement)) {
        throw new ApiError(500, "Statement D1 incompatível com o adaptador do Render.");
      }
      return statement.getQuery();
    });

    if (!queries.length) return [];

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.config.accountId)}/d1/database/${encodeURIComponent(this.config.databaseId)}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ batch: queries }),
        cache: "no-store",
      },
    );

    const payload = (await response.json()) as {
      success?: boolean;
      errors?: Array<{ message?: string }>;
      result?: Array<D1ApiQueryResult<T>>;
    };

    if (!response.ok || payload.success === false) {
      const message =
        payload.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
        `Cloudflare D1 respondeu HTTP ${response.status}.`;
      throw new ApiError(503, `Falha ao executar lote no Cloudflare D1: ${message}`);
    }

    return (payload.result ?? []).map((result) => ({
      success: result.success !== false,
      results: result.results,
      meta: result.meta,
    }));
  }
}

async function runtimeEnv() {
  const renderConfig = renderD1Config();
  if (renderConfig) {
    return {
      DB: new RenderD1Database(renderConfig) as unknown as D1Database,
      BUCKET: undefined as R2Bucket | undefined,
    };
  }

  const moduleName = "cloudflare:workers";
  const runtime = await import(moduleName);
  return runtime.env as unknown as {
    DB?: D1Database;
    BUCKET?: R2Bucket;
  };
}

export async function getD1(): Promise<D1Database> {
  const database = (await runtimeEnv()).DB;
  if (!database) {
    throw new ApiError(
      503,
      "Banco de dados indisponível. No Render, configure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID e CLOUDFLARE_API_TOKEN.",
    );
  }
  await ensureSchema(database);
  return database;
}

export async function getBucket(): Promise<R2Bucket> {
  const bucket = (await runtimeEnv()).BUCKET;
  if (!bucket) {
    throw new ApiError(
      503,
      "Armazenamento de comprovantes indisponível. O acesso R2 continua dependente do binding Cloudflare.",
    );
  }
  return bucket;
}

export async function queryAll<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await (await getD1()).prepare(sql).bind(...params).all<T>();
  if (!result.success) throw new ApiError(500, "Falha ao consultar os dados.");
  return result.results ?? [];
}

export async function queryFirst<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  return (await getD1()).prepare(sql).bind(...params).first<T>();
}

export function jsonError(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: error.message, details: error.details ?? null },
      { status: error.status },
    );
  }
  const message = error instanceof Error ? error.message : "Erro inesperado.";
  console.error("central_frete_error", { message });
  return Response.json(
    { error: "Não foi possível concluir a operação." },
    { status: 500 },
  );
}
