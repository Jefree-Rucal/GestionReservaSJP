import React, { useEffect, useMemo, useState, useRef } from 'react';
import '../styles/Reportes.css';
import { getJSON } from '../utils/api';

// Fechas helpers (en local)
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};

// Parsers robustos
const parseFechaReserva = (r) => {
  // Intentamos varios campos comunes
  const cand = r?.hora_inicio || r?.r_hora_inicio || r?.r_horainicio || r?.fecha;
  const d = cand ? new Date(cand) : null;
  return d && !isNaN(d) ? d : null;
};

const parseEstadoReserva = (r) => {
  // Soporta varias claves y tipos
  const nums = [
    r?.estado_id, r?.r_estado_id, r?.estado, r?.estado_reserva_id
  ].map(Number).filter(Number.isFinite);
  if (nums.length) return nums[0];

  const txt = String(r?.estado_nombre || r?.estado_texto || r?.estado_descripcion || '').toLowerCase();
  if (/pend/i.test(txt)) return 2;
  if (/aprob/i.test(txt)) return 5;
  if (/rechaz|cancel/i.test(txt)) return 6; // mapea rechaz/cancel como 6 para KPI "rechazadas"
  return 0;
};

export default function DashboardEjecutivo() {
  // rango
  const [desde, setDesde] = useState(addDays(today(), -30));
  const [hasta, setHasta] = useState(today());
  const [rango, setRango] = useState('30d');

  // data
  const [reservas, setReservas] = useState([]);
  const [ingresos, setIngresos] = useState([]);

  // ui
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const abortRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError('');
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      // Unificamos rutas a /api/... y heredamos BASE_URL + token con getJSON
      const [r1, r2] = await Promise.all([
        getJSON('/api/reservas/listado', { signal: abortRef.current.signal }).catch(() => []),
        getJSON(`/api/reportes/ingresos?desde=${desde}&hasta=${hasta}`, { signal: abortRef.current.signal }).catch(() => []),
      ]);
      setReservas(Array.isArray(r1) ? r1 : []);
      setIngresos(Array.isArray(r2) ? r2 : []);
    } catch (e) {
      if (e.name !== 'AbortError') setError('No se pudieron cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [desde, hasta]);

  // ===== KPIs =====
  const k = useMemo(() => {
    const s = new Date(`${desde}T00:00:00`);
    const e = new Date(`${hasta}T23:59:59`);

    const enRango = reservas.filter((r) => {
      const d = parseFechaReserva(r);
      return d && d >= s && d <= e;
    });

    const total = enRango.length;
    const pend = enRango.filter((x) => parseEstadoReserva(x) === 2).length;
    const apro = enRango.filter((x) => parseEstadoReserva(x) === 5).length;
    const rech = enRango.filter((x) => parseEstadoReserva(x) === 6).length;

    const q = ingresos.reduce((a, b) => a + Number(b?.monto || 0), 0);

    return { total, pend, apro, rech, q };
  }, [reservas, ingresos, desde, hasta]);

  // ===== Top recursos por uso =====
  const topRecursos = useMemo(() => {
    const m = new Map();
    reservas.forEach((r) => {
      const nom = r?.espacio_nombre || r?.inmueble_nombre || '—';
      if (!nom) return;
      m.set(nom, (m.get(nom) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [reservas]);

  // chips rango rápido
  const setQuick = (tag) => {
    const h = today();
    let d = addDays(h, -30);
    if (tag === '7d') d = addDays(h, -7);
    if (tag === '30d') d = addDays(h, -30);
    if (tag === '90d') d = addDays(h, -90);
    if (tag === '180d') d = addDays(h, -180);
    if (tag === '365d') d = addDays(h, -365);
    setRango(tag);
    setDesde(d);
    setHasta(h);
  };

  return (
    <div className="ana-wrap">
      <div className="ana-head">
        <div>
          <h2 className="ana-title">📊 Dashboard ejecutivo</h2>
          <p className="ana-sub">Visión general de reservas e ingresos</p>
        </div>

        <div className="ana-actions">
          <div className="ranges">
            {['7d', '30d', '90d', '180d', '365d'].map((tag) => (
              <button key={tag} className={`chip ${rango === tag ? 'is-on' : ''}`} onClick={() => setQuick(tag)} disabled={loading}>
                {tag.replace('d', ' días')}
              </button>
            ))}
          </div>

          <input className="ana-input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} disabled={loading} />
          <input className="ana-input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} disabled={loading} />
          <button className="ana-btn" onClick={load} disabled={loading}>
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {error && <div className="ana-error">❌ {error}</div>}

      <div className="ana-kpis">
        <div className="kpi">
          <small>Total reservas</small>
          <div className="val">{k.total}</div>
          <div className="bar"><i style={{ width: `${k.total ? 100 : 10}%` }} /></div>
        </div>
        <div className="kpi warn">
          <small>Pendientes</small>
          <div className="val">{k.pend}</div>
        </div>
        <div className="kpi good">
          <small>Aprobadas</small>
          <div className="val">{k.apro}</div>
        </div>
        <div className="kpi bad">
          <small>Rechazadas</small>
          <div className="val">{k.rech}</div>
        </div>
      </div>

      <div className="ana-grid">
        {/* Top recursos */}
        <div className="card">
          <div className="card-h">
            <b>🧭 Top recursos usados</b>
            <span className="hint">Período {desde} → {hasta}</span>
          </div>

          {loading ? (
            <div className="skeleton" style={{ height: 180 }} />
          ) : topRecursos.length === 0 ? (
            <div className="empty">Sin datos</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Recurso</th><th>Uso</th></tr>
                </thead>
                <tbody>
                  {topRecursos.map(([nom, cnt]) => (
                    <tr key={nom}>
                      <td>{nom}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="bar" style={{ width: 160 }}>
                            <i style={{ width: `${Math.min(100, cnt * 20)}%` }} />
                          </div>
                          <b>{cnt}</b>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Ingresos */}
        <div className="card">
          <div className="card-h">
            <b>💰 Ingresos</b>
            <span className="hint">{desde} → {hasta}</span>
          </div>

          <div style={{ fontSize: 32, fontWeight: 900, color: '#0b63c7', textAlign: 'center', padding: '12px 0' }}>
            {new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(k.q)}
          </div>

          {loading ? (
            <div className="skeleton" style={{ height: 180 }} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Fecha</th><th>Método</th><th>Referencia</th><th>Monto</th></tr>
                </thead>
                <tbody>
                  {ingresos.slice(-10).reverse().map((p) => (
                    <tr key={p.id_pago || `${p.fecha}-${p.referencia || Math.random()}`}>
                      <td>{String(p.fecha || '').slice(0, 10) || '—'}</td>
                      <td>{p.metodo || '—'}</td>
                      <td>{p.referencia || '—'}</td>
                      <td><b>Q{Number(p.monto || 0).toFixed(2)}</b></td>
                    </tr>
                  ))}
                  {ingresos.length === 0 && <tr><td colSpan="4" className="empty">Sin ingresos en el rango</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
