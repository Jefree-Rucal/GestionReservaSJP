// src/components/ReporteUso.jsx
import React, { useEffect, useMemo, useState } from 'react';
import '../styles/Reportes.css';
import { getJSON } from '../utils/api';

// ==== Helpers de fecha en local (America/Guatemala) ====
const pad2 = (n) => String(n).padStart(2, '0');
const ymdLocal = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
};
const todayLocal = () => ymdLocal(new Date());
const monthStartLocal = () => ymdLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

export default function ReporteUso() {
  const [from, setFrom] = useState(monthStartLocal());
  const [to, setTo] = useState(todayLocal());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true);
    setMsg('');
    try {
      // Validación simple de rango
      if (from && to && new Date(`${from}T00:00:00`) > new Date(`${to}T23:59:59`)) {
        setItems([]);
        setMsg('El rango de fechas es inválido (Desde > Hasta).');
        return;
      }

      const data = await getJSON(`/api/reservas/rango?from=${from}&to=${to}`);
      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      setItems(arr);
    } catch (e) {
      setItems([]);
      setMsg('❌ No se pudo cargar el reporte de uso.');
      // opcional: console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [from, to]); // recargar al cambiar rango

  const uso = useMemo(() => {
    const mm = new Map();
    items.forEach((x) => {
      const nombre =
        x.nombre_recurso ||
        x.recurso_nombre ||
        x.espacio_nombre ||
        x.inmueble_nombre ||
        x.espacio ||
        x.inmueble ||
        '—';
      mm.set(nombre, (mm.get(nombre) || 0) + 1);
    });
    return [...mm.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const maxCnt = useMemo(() => Math.max(1, ...uso.map(([, cnt]) => cnt)), [uso]);

  return (
    <div className="ana-wrap">
      <div className="ana-head">
        <div>
          <h2 className="ana-title">🏟️ Uso de espacios/inmuebles</h2>
          <p className="ana-sub">Frecuencia de reservas por recurso</p>
        </div>
        <div className="ana-actions">
          <input
            className="ana-input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            className="ana-input"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <button className="ana-btn" onClick={load}>Actualizar</button>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <b>Ranking de uso</b>
          <span className="hint">{from} → {to}</span>
        </div>

        {loading ? (
          <div className="empty">Cargando…</div>
        ) : msg ? (
          <div className="empty">{msg}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Recurso</th>
                  <th>Reservas</th>
                </tr>
              </thead>
              <tbody>
                {uso.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="empty">Sin resultados</td>
                  </tr>
                ) : (
                  uso.map(([nom, cnt], i) => (
                    <tr key={nom}>
                      <td>{i + 1}</td>
                      <td>{nom}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="bar" style={{ width: 220 }}>
                            <i style={{ width: `${(cnt / maxCnt) * 100}%` }} />
                          </div>
                          <b>{cnt}</b>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
