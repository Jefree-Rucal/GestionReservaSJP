// src/components/VistaDisponibilidad.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import "../styles/VistaDisponibilidad.css";
import { getJSON } from "../utils/api";

// armar querystring rápido
const qs = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

export default function VistaDisponibilidad() {
  const hoy = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);

  const [activeTab, setActiveTab] = useState("inmuebles"); // 'inmuebles' | 'espacios'
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState({ type: null, text: "" });

  const [inmuebles, setInmuebles] = useState([]);
  const [espacios, setEspacios] = useState([]);

  // Para los endpoints /disponibilidad/* (esperan 'desde' y 'hasta')
  const paramsDisp = useMemo(() => qs({ desde, hasta }), [desde, hasta]);
  // Para el fallback /reservas/rango (espera 'from' y 'to')
  const paramsRango = useMemo(() => qs({ from: desde, to: hasta }), [desde, hasta]);

  const showBanner = useCallback((type, text, ms = 3000) => {
    setBanner({ type, text });
    if (ms) setTimeout(() => setBanner({ type: null, text: "" }), ms);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "inmuebles") {
        // 1) Intentar endpoint dedicado
        try {
          const data = await getJSON(`/api/reservas/disponibilidad/inmuebles?${paramsDisp}`);
          setInmuebles(Array.isArray(data) ? data : []);
        } catch {
          // 2) Fallback: calcular desde /reservas/rango + catálogo
          const rango = await getJSON(`/api/reservas/rango?${paramsRango}`);
          const cat = await getJSON(`/api/catalogos/inmuebles`);

          // Sumar por nombre de inmueble en el rango
          const sumByNombre = new Map();
          for (const it of (Array.isArray(rango) ? rango : [])) {
            const nombreInm =
              it?.inmueble_nombre || it?.inmueble || it?.nombre_inmueble || it?.recurso_nombre;
            if (!nombreInm) continue;
            const cant = Number(
              it?.cantidad_reserva ?? it?.cantidad ?? it?.r_cantidad ?? 0
            );
            sumByNombre.set(
              nombreInm,
              (sumByNombre.get(nombreInm) || 0) + (Number.isFinite(cant) ? cant : 0)
            );
          }

          const rows = (Array.isArray(cat) ? cat : []).map((c) => {
            const id_inmueble = c.id_inmueble ?? c.id ?? null;
            const nombre = c.i_nombre || c.nombre || "—";
            const total = Number(c.cantidad_total ?? c.i_cantidad_total ?? 0);
            const reservado = Number(sumByNombre.get(nombre) || 0);
            const disponible = Math.max(0, total - reservado);
            return {
              id_inmueble,
              nombre,
              cantidad_total: total,
              cantidad_reservada: reservado,
              cantidad_disponible: disponible,
            };
          });

          setInmuebles(rows);
        }
      }

      if (activeTab === "espacios") {
        // 1) Intentar endpoint dedicado
        try {
          const data = await getJSON(`/api/reservas/disponibilidad/espacios?${paramsDisp}`);
          setEspacios(Array.isArray(data) ? data : []);
        } catch {
          // 2) Fallback: calcular desde /reservas/rango + catálogo
          const rango = await getJSON(`/api/reservas/rango?${paramsRango}`);
          const cat = await getJSON(`/api/catalogos/espacios`);

          // “Ocupado” si en el rango existe alguna reserva del espacio (por nombre)
          const ocupadosPorNombre = new Set(
            (Array.isArray(rango) ? rango : [])
              .map((x) => x?.espacio_nombre || x?.espacio || x?.nombre_espacio || x?.recurso_nombre)
              .filter(Boolean)
          );

          const rows = (Array.isArray(cat) ? cat : []).map((c) => {
            const id_espacio = c.id_espacio ?? c.id ?? null;
            const nombre = c.e_nombre || c.nombre || "—";
            return { id_espacio, nombre, ocupado: ocupadosPorNombre.has(nombre) };
          });

          setEspacios(rows);
        }
      }
    } catch (err) {
      console.error(err);
      showBanner("error", err?.message || "Error al cargar disponibilidad");
      if (activeTab === "inmuebles") setInmuebles([]);
      if (activeTab === "espacios") setEspacios([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, paramsDisp, paramsRango, showBanner]);

  // Cargar datos cuando cambien rango o pestaña
  useEffect(() => { load(); }, [load]);

  return (
    <div className="disp-container">
      <div className="disp-toolbar">
        <h3>📈 Disponibilidad</h3>
        <div className="disp-filtros">
          <label>
            Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <button className="btn" onClick={load}>Actualizar</button>
        </div>
      </div>

      {banner.type && (
        <div className={`hist-alert ${banner.type === "error" ? "hist-alert--error" : "hist-alert--ok"}`}>
          {banner.text}
        </div>
      )}

      <div className="disp-tabs">
        <button
          className={`tab-btn ${activeTab === "inmuebles" ? "is-active" : ""}`}
          onClick={() => setActiveTab("inmuebles")}
        >
          🪑 Inmuebles
          <span className="count">{inmuebles.length}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === "espacios" ? "is-active" : ""}`}
          onClick={() => setActiveTab("espacios")}
        >
          🏟️ Espacios
          <span className="count">{espacios.length}</span>
        </button>
      </div>

      {activeTab === "inmuebles" && (
        <div className="card">
          <div className="card-title">Inmuebles (por cantidad)</div>
          <div className="tabla-wrap --with-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Inmueble</th>
                  <th>Total</th>
                  <th>Reservada</th>
                  <th>Disponible</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan="6" className="sin-datos">Cargando…</td></tr>}
                {!loading && inmuebles.length === 0 && (
                  <tr><td colSpan="6" className="sin-datos">Sin resultados</td></tr>
                )}
                {!loading && inmuebles.map((i) => {
                  const total = Number(i.cantidad_total ?? 0);
                  const reservada = Number(i.cantidad_reservada ?? 0);
                  const disponible = Number(
                    i.cantidad_disponible ?? Math.max(0, total - reservada)
                  );
                  return (
                    <tr key={i.id_inmueble}>
                      <td>{i.id_inmueble}</td>
                      <td>{i.nombre}</td>
                      <td>{total}</td>
                      <td>{reservada}</td>
                      <td>{disponible}</td>
                      <td>
                        {disponible > 0
                          ? <span className="badge badge-5">Disponible</span>
                          : <span className="badge badge-6">Sin stock</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="muted">* El cálculo usa solape en el rango y estados activos.</div>
        </div>
      )}

      {activeTab === "espacios" && (
        <div className="card">
          <div className="card-title">Espacios Públicos (ocupación)</div>
          <div className="tabla-wrap --with-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Espacio</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan="3" className="sin-datos">Cargando…</td></tr>}
                {!loading && espacios.length === 0 && (
                  <tr><td colSpan="3" className="sin-datos">Sin resultados</td></tr>
                )}
                {!loading && espacios.map((e) => (
                  <tr key={e.id_espacio}>
                    <td>{e.id_espacio}</td>
                    <td>{e.nombre}</td>
                    <td>
                      {e.ocupado
                        ? <span className="badge badge-6">Ocupado</span>
                        : <span className="badge badge-5">Libre</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="muted">
            * “Ocupado” si existe al menos una reserva que se cruza en el rango.
          </div>
        </div>
      )}
    </div>
  );
}
