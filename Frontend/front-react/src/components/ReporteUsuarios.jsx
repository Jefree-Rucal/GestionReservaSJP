// src/components/ReporteUsuarios.jsx
import React, { useEffect, useMemo, useState } from 'react';
import '../styles/Reportes.css';
import { getJSON } from '../utils/api';

const ESTADOS = {
  PENDIENTE: 2,
  APROBADA: 5,
  RECHAZADA: 6,
};

export default function ReporteUsuarios() {
  const [data, setData] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true);
    setMsg('');
    try {
      const arr = await getJSON('/api/reservas/listado');
      setData(Array.isArray(arr) ? arr : []);
    } catch (e) {
      setData([]);
      setMsg('❌ No se pudo cargar la actividad de solicitantes.');
      // opcional: console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const usuarios = useMemo(() => {
    const map = new Map();
    (data || []).forEach((r) => {
      const nombre = (r.solicitante_nombre || '—').toString();
      const key = nombre.toLowerCase().trim();
      const est = Number(r?.estado_id ?? 0);

      const it = map.get(key) || { nombre, total: 0, apro: 0, pend: 0, rech: 0 };
      it.total += 1;
      if (est === ESTADOS.APROBADA) it.apro += 1;
      else if (est === ESTADOS.PENDIENTE) it.pend += 1;
      else if (est === ESTADOS.RECHAZADA) it.rech += 1;

      map.set(key, it);
    });

    let list = [...map.values()];
    if (q.trim()) {
      const nq = q.toLowerCase();
      list = list.filter((x) => x.nombre.toLowerCase().includes(nq));
    }

    // Orden: total desc, luego aprobadas desc, luego nombre asc
    return list.sort(
      (a, b) => b.total - a.total || b.apro - a.apro || a.nombre.localeCompare(b.nombre)
    );
  }, [data, q]);

  const totUsuarios = usuarios.length;
  const totReservas = useMemo(() => usuarios.reduce((acc, u) => acc + u.total, 0), [usuarios]);
  const totAprob = useMemo(() => usuarios.reduce((acc, u) => acc + u.apro, 0), [usuarios]);
  const totPend = useMemo(() => usuarios.reduce((acc, u) => acc + u.pend, 0), [usuarios]);
  const totRech = useMemo(() => usuarios.reduce((acc, u) => acc + u.rech, 0), [usuarios]);

  return (
    <div className="ana-wrap">
      <div className="ana-head">
        <div>
          <h2 className="ana-title">👥 Actividad de solicitantes</h2>
          <p className="ana-sub">Quiénes reservan más y sus resultados</p>
        </div>
        <div className="ana-actions">
          <input
            className="ana-input"
            placeholder="Buscar por nombre…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="ana-btn" onClick={load}>Actualizar</button>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <b>Ranking por cantidad de reservas</b>
          <span className="hint">
            Usuarios: {totUsuarios} • Total reservas: {totReservas} • ✅ {totAprob} • ⏳ {totPend} • ❌ {totRech}
          </span>
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
                  <th>Solicitante</th>
                  <th>Total</th>
                  <th>Aprobadas</th>
                  <th>Pendientes</th>
                  <th>Rechazadas</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="empty">Sin resultados</td>
                  </tr>
                ) : (
                  usuarios.map((u, i) => (
                    <tr key={u.nombre + i}>
                      <td>{i + 1}</td>
                      <td>{u.nombre}</td>
                      <td><b>{u.total}</b></td>
                      <td><span className="badge ok">{u.apro}</span></td>
                      <td><span className="badge busy">{u.pend}</span></td>
                      <td><span className="badge err">{u.rech}</span></td>
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
