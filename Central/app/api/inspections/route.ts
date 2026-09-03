import { authorize } from "@/lib/server/auth";
import { getD1, jsonError, queryAll } from "@/lib/server/d1";

const INSPECTION_ROLES = ["ADMIN", "GERENCIA"] as const;

function id() {
  return crypto.randomUUID();
}

function orderNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `VST-${stamp}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export async function GET(request: Request) {
  try {
    await authorize(request, [...INSPECTION_ROLES]);
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim();
    const q = url.searchParams.get("q")?.trim();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      conditions.push("o.status = ?");
      params.push(status);
    }
    if (q) {
      conditions.push("(o.order_number ilike ? or v.plate ilike ? or coalesce(v.chassis, '') ilike ? or coalesce(c.legal_name, '') ilike ?)");
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const rows = await queryAll(
      `select o.id, o.order_number, o.status, o.origin, o.destination,
              o.planned_pickup_at, o.planned_delivery_at, o.created_at,
              v.id as vehicle_id, v.plate, v.brand, v.model, v.color,
              c.id as client_id, coalesce(c.trade_name, c.legal_name) as client_name
         from inspection_orders o
         join inspection_vehicles v on v.id = o.vehicle_id
         left join clients c on c.id = o.client_id
         ${where}
        order by o.created_at desc
        limit 100`,
      params,
    );
    return Response.json({ orders: rows });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await authorize(request, [...INSPECTION_ROLES]);
    const body = await request.json() as Record<string, unknown>;
    const plate = String(body.plate ?? "").trim().toUpperCase();
    const origin = String(body.origin ?? "").trim();
    const destination = String(body.destination ?? "").trim();
    const clientId = body.clientId ? String(body.clientId) : null;

    if (!plate || !origin || !destination) {
      return Response.json({ error: "Placa, origem e destino são obrigatórios." }, { status: 400 });
    }

    const db = await getD1();
    const vehicleId = id();
    const orderId = id();
    const eventId = id();
    const number = orderNumber();
    const now = new Date().toISOString();

    await db.batch([
      db.prepare(`insert into inspection_vehicles
        (id, client_id, plate, chassis, renavam, brand, model, version, manufacture_year, model_year, color, current_mileage, fuel_level, notes, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          vehicleId,
          clientId,
          plate,
          body.chassis ? String(body.chassis).trim().toUpperCase() : null,
          body.renavam ? String(body.renavam).trim() : null,
          body.brand ? String(body.brand).trim() : null,
          body.model ? String(body.model).trim() : null,
          body.version ? String(body.version).trim() : null,
          body.manufactureYear ? Number(body.manufactureYear) : null,
          body.modelYear ? Number(body.modelYear) : null,
          body.color ? String(body.color).trim() : null,
          body.mileage ? Number(body.mileage) : null,
          body.fuelLevel != null ? Number(body.fuelLevel) : null,
          body.notes ? String(body.notes).trim() : null,
          now,
          now,
        ),
      db.prepare(`insert into inspection_orders
        (id, order_number, client_id, vehicle_id, origin, destination, transport_company, driver_name, carrier_plate, status, planned_pickup_at, planned_delivery_at, notes, created_by, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGUARDANDO_COLETA', ?, ?, ?, ?, ?, ?)`)
        .bind(
          orderId,
          number,
          clientId,
          vehicleId,
          origin,
          destination,
          body.transportCompany ? String(body.transportCompany).trim() : null,
          body.driverName ? String(body.driverName).trim() : null,
          body.carrierPlate ? String(body.carrierPlate).trim().toUpperCase() : null,
          body.plannedPickupAt ? String(body.plannedPickupAt) : null,
          body.plannedDeliveryAt ? String(body.plannedDeliveryAt) : null,
          body.notes ? String(body.notes).trim() : null,
          user.id,
          now,
          now,
        ),
      db.prepare(`insert into inspection_events
        (id, order_id, event_type, description, user_id, metadata, created_at)
        values (?, ?, 'ORDEM_CRIADA', ?, ?, ?, ?)`)
        .bind(eventId, orderId, `Ordem ${number} criada.`, user.id, JSON.stringify({ source: "api" }), now),
    ]);

    return Response.json({ id: orderId, orderNumber: number }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
