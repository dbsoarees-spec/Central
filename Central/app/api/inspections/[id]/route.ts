import { authorize } from "@/lib/server/auth";
import { getD1, jsonError, queryAll, queryFirst } from "@/lib/server/d1";

const ROLES = ["ADMIN", "GERENCIA"] as const;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorize(request, [...ROLES]);
    const { id } = await params;
    const order = await queryFirst(
      `select o.*, v.plate, v.chassis, v.brand, v.model, v.version, v.color, v.manufacture_year, v.model_year, v.current_mileage, v.fuel_level,
              coalesce(c.trade_name, c.legal_name) as client_name
         from inspection_orders o
         join inspection_vehicles v on v.id = o.vehicle_id
         left join clients c on c.id = o.client_id
        where o.id = ? limit 1`,
      [id],
    );
    if (!order) return Response.json({ error: "Ordem não encontrada." }, { status: 404 });

    const inspections = await queryAll(
      `select i.*, u.name as responsible_name,
              (select count(*) from inspection_items x where x.inspection_id = i.id) as item_count,
              (select count(*) from inspection_damages x where x.inspection_id = i.id) as damage_count,
              (select count(*) from inspection_photos x where x.inspection_id = i.id) as photo_count
         from inspections i left join users u on u.id = i.responsible_user_id
        where i.order_id = ? order by i.started_at asc`,
      [id],
    );
    const events = await queryAll(
      `select e.*, u.name as user_name from inspection_events e left join users u on u.id = e.user_id where e.order_id = ? order by e.created_at asc`,
      [id],
    );
    const damages = await queryAll(
      `select d.*, i.type as inspection_type from inspection_damages d join inspections i on i.id = d.inspection_id where i.order_id = ? order by d.created_at asc`,
      [id],
    );

    return Response.json({ order, inspections, events, damages });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorize(request, [...ROLES]);
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    const allowedStatuses = new Set(["AGUARDANDO_COLETA", "EM_COLETA", "PATIO_ORIGEM", "EM_TRANSITO", "PATIO_DESTINO", "AGUARDANDO_ENTREGA", "ENTREGUE", "ENCERRADA", "OCORRENCIA", "CANCELADA"]);
    const status = String(body.status ?? "");
    if (action !== "status" || !allowedStatuses.has(status)) {
      return Response.json({ error: "Informe uma ação de status válida." }, { status: 400 });
    }

    const existing = await queryFirst<{ status: string; order_number: string }>("select status, order_number from inspection_orders where id = ? limit 1", [id]);
    if (!existing) return Response.json({ error: "Ordem não encontrada." }, { status: 404 });

    const db = await getD1();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("update inspection_orders set status = ?, updated_at = ? where id = ?").bind(status, now, id),
      db.prepare("insert into inspection_events (id, order_id, event_type, description, user_id, metadata, created_at) values (?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), id, "STATUS_ALTERADO", `Status alterado de ${existing.status} para ${status}.`, user.id, JSON.stringify({ from: existing.status, to: status }), now),
    ]);
    return Response.json({ ok: true, status });
  } catch (error) {
    return jsonError(error);
  }
}
