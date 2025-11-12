import React, { useEffect, useMemo, useState, useCallback } from "react";
import "../styles/VistaDisponibilidad.css";

const api = (p) => `http://localhost:5000${p}`;

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

  // Para los endpoints /disponibilidad/* del backend (esperan 'desde' y 'hasta')
  const paramsDisp = useMemo(() => qs({ desde, hasta }), [desde, hasta]);
  // Para el fallback /reservas/rango (espera 'from' y 'to')
  const paramsRango = useMemo(() => qs({ from: desde, to: hasta }), [desde, hasta]);

  const showBanner = useCallback((type, text, ms = 3000) => {
    setBanner({ type, text });
    if (ms) setTimeout(() => setBanner({ type: null, text: "" }), ms);
  }, []);

  // Cargar datos cuando cambie el rango o la pestaña
  useEffect(() => {
    let abort = false;

    const load = async () => {
      try {
        setLoading(true);

        if (activeTab === "inmuebles") {
          // 1) Intentar endpoint dedicado
          let r = await fetch(api(`/api/reservas/disponibilidad/inmuebles?${paramsDisp}`));
          if (r.ok) {
            const data = await r.json();
            if (!abort) setInmuebles(Array.isArray(data) ? data : []);
          } else {
            // 2) Fallback: calcular desde /reservas/rango + catálogo
            const rr = await fetch(api(`/api/reservas/rango?${paramsRango}`));
            if (!rr.ok) throw new Error("No se pudo obtener reservas (fallback inmuebles)");
            const data = await rr.json();

            const catRes = await fetch(api(`/api/reservas/inmuebles`));
            if (!catRes.ok) throw new Error("No se pudo obtener catálogo de inmuebles");
            const cat = await catRes.json();

            // El endpoint /rango retorna 'inmueble' como NOMBRE (string). Sumamos por nombre.
            const sumByNombre = new Map();
            for (const it of data) {
              const nombreInm = it?.inmueble || it?.nombre_inmueble;
              if (!nombreInm) continue;
              const cant = Number(it?.cantidad ?? 0);
              sumByNombre.set(nombreInm, (sumByNombre.get(nombreInm) || 0) + (isFinite(cant) ? cant : 0));
            }

            const rows = cat.map((c) => {
              const nombre = c.i_nombre || c.nombre || "—";
              const total = Number(c.cantidad_total ?? 0);
              const reservado = Number(sumByNombre.get(nombre) || 0);
              return {
                id_inmueble: c.id_inmueble,
                nombre,
                cantidad_total: total,
                cantidad_reservada: reservado,
                cantidad_disponible: Math.max(0, total - reservado),
              };
            });
            if (!abort) setInmuebles(rows);
          }
        }

        if (activeTab === "espacios") {
          // 1) Intentar endpoint dedicado
          let r = await fetch(api(`/api/reservas/disponibilidad/espacios?${paramsDisp}`));
          if (r.ok) {
            const data = await r.json();
            if (!abort) setEspacios(Array.isArray(data) ? data : []);
          } else {
            // 2) Fallback: calcular desde /reservas/rango + catálogo
            const rr = await fetch(api(`/api/reservas/rango?${paramsRango}`));
            if (!rr.ok) throw new Error("No se pudo obtener reservas (fallback espacios)");
            const data = await rr.json();

            const catRes = await fetch(api(`/api/reservas/espacios`));
            if (!catRes.ok) throw new Error("No se pudo obtener catálogo de espacios");
            const cat = await catRes.json();

            // Ocupado si en el rango hay entradas con nombre_espacio
            const ocupadosPorNombre = new Set(
              data
                .map((x) => x?.espacio || x?.nombre_espacio)
                .filter(Boolean)
            );

            const rows = cat.map((c) => {
              const nombre = c.e_nombre || c.nombre || "—";
              return {
                id_espacio: c.id_espacio,
                nombre,
                ocupado: ocupadosPorNombre.has(nombre),
              };
            });
            if (!abort) setEspacios(rows);
          }
        }
      } catch (err) {
        if (!abort) showBanner("error", err.message || "Error al cargar disponibilidad");
        if (!abort && activeTab === "inmuebles") setInmuebles([]);
        if (!abort && activeTab === "espacios") setEspacios([]);
      } finally {
        if (!abort) setLoading(false);
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [paramsDisp, paramsRango, activeTab, showBanner]);

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
          <button className="btn" onClick={() => setActiveTab((t) => t)}>Actualizar</button>
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
