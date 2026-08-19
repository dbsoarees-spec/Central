import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";
import {
  createPasswordCredential,
  createUserSessionToken,
  isLocalRequest,
  LOCAL_SESSION_COOKIE,
  validateInitialPassword,
  verifyPassword,
} from "@/lib/server/local-session";
import { asObject } from "@/lib/server/validation";

type LoginUserRow = {
  id: string;
  email: string;
  username: string | null;
  passwordSalt: string | null;
  passwordHash: string | null;
  name: string;
  role: string;
  active: number;
};

function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const payload = asObject(await request.json());
    const username = normalizeUsername(payload.username);
    const password = String(payload.password ?? "");
    if (!username) throw new ApiError(400, "Informe o usuário.");
    if (!password) throw new ApiError(400, "Informe a senha.");

    const count = await queryFirst<{ total: number }>(
      `select count(*) as total from users`,
    );
    const db = await getD1();

    // Primeira instalação: cria um ADMIN local usando a senha inicial configurada.
    if ((count?.total ?? 0) === 0) {
      if (username !== "admin" || !(await validateInitialPassword(password))) {
        throw new ApiError(401, "Usuário ou senha incorretos.");
      }
      const id = crypto.randomUUID();
      const credential = await createPasswordCredential(password);
      await db
        .prepare(
          `insert into users (
            id, email, username, password_salt, password_hash, name, role, active
          ) values (?, 'admin@centralfrete.local', 'admin', ?, ?,
            'ADMINISTRADOR', 'ADMIN', 1)`,
        )
        .bind(id, credential.passwordSalt, credential.passwordHash)
        .run();
    }

    let user = await queryFirst<LoginUserRow>(
      `select id, email, username, password_salt as passwordSalt,
        password_hash as passwordHash, name, role, active
       from users
       where lower(coalesce(username, '')) = ? or lower(email) = ?
       limit 1`,
      [username, username],
    );

    if (!user || !user.active) {
      throw new ApiError(401, "Usuário ou senha incorretos.");
    }

    // Compatibilidade para bancos existentes: o primeiro ADMIN sem senha pode
    // ativar seu login com a senha inicial definida no ambiente.
    if (!user.passwordHash || !user.passwordSalt) {
      if (user.role !== "ADMIN" || !(await validateInitialPassword(password))) {
        throw new ApiError(
          401,
          "Este acesso ainda não possui senha. Solicite ao administrador.",
        );
      }
      const credential = await createPasswordCredential(password);
      const fallbackUsername =
        user.username ||
        (username.includes("@") ? username.split("@")[0] : username) ||
        "admin";
      await db
        .prepare(
          `update users set username = ?, password_salt = ?, password_hash = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?`,
        )
        .bind(
          fallbackUsername,
          credential.passwordSalt,
          credential.passwordHash,
          user.id,
        )
        .run();
      user = { ...user, username: fallbackUsername, ...credential };
    }

    if (!(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
      throw new ApiError(401, "Usuário ou senha incorretos.");
    }

    const sessionUsername = user.username || user.email.toLowerCase();
    const token = await createUserSessionToken({
      id: user.id,
      email: user.email,
      username: sessionUsername,
      name: user.name,
    });
    const secure = isLocalRequest(request) ? "" : "; Secure";
    return Response.json(
      { authenticated: true, role: user.role },
      {
        headers: {
          "set-cookie": `${LOCAL_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`,
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
