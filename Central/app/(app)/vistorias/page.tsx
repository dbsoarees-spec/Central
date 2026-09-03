"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Order = {
  id: string;
  order_number: string;
  status: string;
  origin: string;
  destination: string;
  plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  client_name: string | null;
  created_at: string;
};

const statusLabel: Record<string, string> = {
  RASCUNHO: "Rascunho",
  AGUARDANDO_COLETA: "Aguardando coleta",
  EM_COLETA: "Em coleta",
  PATIO_ORIGEM: "Pátio origem",
  EM_TRANSITO: "Em trânsito",
  PATIO_DESTINO: "Pátio destino",
  AGUARDANDO_ENTREGA: "Aguardando entrega",
  ENTREGUE: "Entregue",
  ENCERRADA: "Encerrada",
  OCORRENCIA: "Ocorrência",
  CANCELADA: "Cancelada",
};

export default function VistoriasPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function loadOrders(search = q) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/inspections?q=${encodeURIComponent(search)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar as vistorias.");
      setOrders(payload.orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar as vistorias.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadOrders(""); }, []);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível criar a ordem.");
      setOpen(false);
      event.currentTarget.reset();
      await loadOrders("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar a ordem.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Operação</span>
          <h1>Vistoria de veículos</h1>
          <p>Controle a coleta, os pátios, o transporte e a entrega final em uma única ordem.</p>
        </div>
        <button className="button button-primary" onClick={() => setOpen(true)}>+ Nova vistoria</button>
      </div>

      <div className="panel" style={{ display: "grid", gap: 16 }}>
        <form onSubmit={(e) => { e.preventDefault(); void loadOrders(q); }} style={{ display: "flex", gap: 10 }}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por ordem, placa, chassi ou cliente" />
          <button className="button" type="submit">Buscar</button>
        </form>
        {error && <div className="alert alert-error">{error}</div>}

        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%" }}>
            <thead><tr><th>Ordem</th><th>Veículo</th><th>Cliente</th><th>Rota</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6}>Carregando…</td></tr> : orders.length === 0 ? <tr><td colSpan={6}>Nenhuma ordem de vistoria cadastrada.</td></tr> : orders.map((order) => (
                <tr key={order.id}>
                  <td><strong>{order.order_number}</strong><br /><small>{new Date(order.created_at).toLocaleString("pt-BR")}</small></td>
                  <td><strong>{order.plate}</strong><br /><small>{[order.brand, order.model, order.color].filter(Boolean).join(" · ") || "Veículo"}</small></td>
                  <td>{order.client_name || "Não informado"}</td>
                  <td>{order.origin}<br />↓ {order.destination}</td>
                  <td><span className="status-badge">{statusLabel[order.status] || order.status}</span></td>
                  <td><Link className="button button-small" href={`/vistorias/${order.id}`}>Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && <div className="modal-backdrop" role="presentation">
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-inspection-title">
          <div className="modal-header"><div><span className="eyebrow">Nova operação</span><h2 id="new-inspection-title">Criar ordem de vistoria</h2></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Fechar">×</button></div>
          <form onSubmit={createOrder} className="form-grid">
            <label>Placa<input className="input" name="plate" required placeholder="ABC1D23" /></label>
            <label>Chassi<input className="input" name="chassis" placeholder="Chassi" /></label>
            <label>Marca<input className="input" name="brand" placeholder="Toyota" /></label>
            <label>Modelo<input className="input" name="model" placeholder="Corolla" /></label>
            <label>Cor<input className="input" name="color" placeholder="Prata" /></label>
            <label>Quilometragem<input className="input" name="mileage" type="number" min="0" /></label>
            <label className="field-wide">Cliente ID<input className="input" name="clientId" placeholder="Opcional — ID do cliente cadastrado" /></label>
            <label className="field-wide">Origem<input className="input" name="origin" required placeholder="Cidade/UF ou endereço" /></label>
            <label className="field-wide">Destino<input className="input" name="destination" required placeholder="Cidade/UF ou endereço" /></label>
            <label>Transportadora<input className="input" name="transportCompany" /></label>
            <label>Motorista<input className="input" name="driverName" /></label>
            <label>Placa do caminhão<input className="input" name="carrierPlate" /></label>
            <label>Observações<textarea className="input field-wide" name="notes" rows={3} /></label>
            <div className="modal-actions field-wide"><button type="button" className="button" onClick={() => setOpen(false)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Salvando…" : "Criar ordem"}</button></div>
          </form>
        </div>
      </div>}
    </section>
  );
}
