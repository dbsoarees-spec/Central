"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const labels: Record<string, string> = {
  AGUARDANDO_COLETA: "Aguardando coleta", EM_COLETA: "Em coleta", PATIO_ORIGEM: "Pátio origem",
  EM_TRANSITO: "Em trânsito", PATIO_DESTINO: "Pátio destino", AGUARDANDO_ENTREGA: "Aguardando entrega",
  ENTREGUE: "Entregue", ENCERRADA: "Encerrada", OCORRENCIA: "Ocorrência", CANCELADA: "Cancelada",
};
const steps = ["AGUARDANDO_COLETA", "EM_COLETA", "PATIO_ORIGEM", "EM_TRANSITO", "PATIO_DESTINO", "AGUARDANDO_ENTREGA", "ENTREGUE"];

type Payload = { order: any; inspections: any[]; events: any[]; damages: any[] };

export default function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [id, setId] = useState("");

  useEffect(() => { void params.then(({ id: value }) => setId(value)); }, [params]);
  useEffect(() => {
    if (!id) return;
    fetch(`/api/inspections/${id}`, { cache: "no-store" }).then(async (r) => {
      const p = await r.json(); if (!r.ok) throw new Error(p.error || "Erro ao carregar a ordem."); setData(p);
    }).catch((e) => setError(e.message));
  }, [id]);

  async function changeStatus(status: string) {
    if (!id) return;
    const response = await fetch(`/api/inspections/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", status }) });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error || "Não foi possível alterar o status."); return; }
    const refreshed = await fetch(`/api/inspections/${id}`, { cache: "no-store" }).then((r) => r.json());
    setData(refreshed);
  }

  if (error) return <section className="panel"><span className="eyebrow">Vistoria</span><h2>{error}</h2><Link className="button" href="/vistorias">Voltar</Link></section>;
  if (!data) return <section className="panel">Carregando ordem…</section>;

  const { order, inspections, events, damages } = data;
  const currentIndex = steps.indexOf(order.status);

  return <section className="page-stack">
    <div className="page-heading"><div><Link href="/vistorias" className="eyebrow">← Vistorias</Link><h1>{order.order_number}</h1><p>{order.plate} · {[order.brand, order.model, order.color].filter(Boolean).join(" · ") || "Veículo"}</p></div><span className="status-badge">{labels[order.status] || order.status}</span></div>

    <div className="panel">
      <h2>Andamento da operação</h2>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${steps.length}, minmax(100px, 1fr))`, gap: 8, marginTop: 18, overflowX: "auto" }}>
        {steps.map((step, index) => <div key={step} style={{ opacity: currentIndex >= index ? 1 : .45 }}><div style={{ fontSize: 22 }}>{currentIndex >= index ? "●" : "○"}</div><small>{labels[step]}</small></div>)}
      </div>
      <div className="form-grid" style={{ marginTop: 22 }}>
        <div><strong>Origem</strong><br />{order.origin}</div><div><strong>Destino</strong><br />{order.destination}</div><div><strong>Cliente</strong><br />{order.client_name || "Não informado"}</div><div><strong>Transportadora</strong><br />{order.transport_company || "Não informada"}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 22 }}>
        {steps.filter((step) => step !== order.status).map((step) => <button key={step} className="button button-small" onClick={() => void changeStatus(step)}>{labels[step]}</button>)}
      </div>
    </div>

    <div className="panel"><h2>Dossiê e vistorias</h2><div className="stats-grid" style={{ marginTop: 16 }}><div><strong>{inspections.length}</strong><small>vistorias</small></div><div><strong>{damages.length}</strong><small>avarias</small></div><div><strong>{inspections.reduce((n, x) => n + Number(x.photo_count || 0), 0)}</strong><small>fotos</small></div></div></div>

    <div className="panel"><h2>Histórico</h2><div style={{ display: "grid", gap: 14, marginTop: 16 }}>{events.length === 0 ? <p>Nenhum evento registrado.</p> : events.map((event) => <div key={event.id} style={{ borderLeft: "3px solid currentColor", paddingLeft: 12 }}><strong>{event.description}</strong><br /><small>{new Date(event.created_at).toLocaleString("pt-BR")} · {event.user_name || "Sistema"}</small></div>)}</div></div>
  </section>;
}
