import type { CurrentUser, Role } from "@/lib/contracts";
import { roleCan } from "@/lib/domain/permissions";
import { ApiError, getD1, queryFirst } from "@/lib/server/d1";
import { verifyLocalSession } from "@/lib/server/local-session";

const ALLOWED_ROLES: Role[] = ["ADMIN", "GERENCIA", "VENDEDOR", "FINANCEIRO"];

function decodeName(request: Request): string | null {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  if (
    !encoded ||
    request.headers.get("oai-authenticated-user-full-name-encoding") !==
      "percent-encoded-utf-8"
  ) {
    return null;
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

async function requestIdentity(request: Request) {
  const session = await verifyLocalSession(request);
  if (session) {
    return {
      userId: session.userId,
      email: session.email,
      name: session.name,
    };
  }

  const platformEmail = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (platformEmail) {
    return {
      userId: null,
      email: platformEmail,
      name: decodeName(request)?.trim() || platformEmail,
    };
  }

  throw new ApiError(401, "Informe usuário e senha para acessar o sistema.");
}

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: number;
};

export async function authorize(
  request: Request,
  allowedRoles: Role[] = ALLOWED_ROLES,
): Promise<CurrentUser> {
  const identity = await requestIdentity(request);
  let row = identity.userId
    ? await queryFirst<UserRow>(
        `select id, email, name, role, active from users where id = ? limit 1`,
        [identity.userId],
      )
    : await queryFirst<UserRow>(
        `select id, email, name, role, active from users where email = ? limit 1`,
        [identity.email],
      );

  // Preserva o primeiro acesso pela identidade autenticada da plataforma.
  // A partir daí o ADMIN pode criar logins próprios para os demais usuários.
  if (!row && !identity.userId) {
    const count = await queryFirst<{ total: number }>(
      `select count(*) as total from users`,
    );
    if ((count?.total ?? 0) === 0) {
      const id = crypto.randomUUID();
      await (await getD1())
        .prepare(
          `insert into users (id, email, name, role, active)
           values (?, ?, ?, 'ADMIN', 1)`,
        )
        .bind(id, identity.email, identity.name.toUpperCase())
        .run();
      row = {
        id,
        email: identity.email,
        name: identity.name.toUpperCase(),
        role: "ADMIN",
        active: 1,
      };
    }
  }

  if (!row) {
    throw new ApiError(
      403,
      "Seu usuário ainda não foi autorizado no Central Frete.",
    );
  }
  if (!row.active) throw new ApiError(403, "Usuário inativo.");
  if (!ALLOWED_ROLES.includes(row.role as Role)) {
    throw new ApiError(403, "Perfil de acesso inválido.");
  }
  if (!allowedRoles.includes(row.role as Role)) {
    throw new ApiError(403, "Seu perfil não permite esta operação.");
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as Role,
  };
}

export function canManagePayments(role: Role) {
  return roleCan(role, "MANAGE_PAYMENTS");
}

export function canManageMasterData(role: Role) {
  return roleCan(role, "MANAGE_CLIENTS");
}
