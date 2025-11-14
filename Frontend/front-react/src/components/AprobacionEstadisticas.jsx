// src/components/AprobacionEstadisticas.jsx
import React, { useEffect, useMemo, useState } from 'react';
import '../styles/Aprobacion.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getJSON } from '../utils/api'; // 👈 usamos tus helpers (sin localhost)

// Estados relevantes para el dashboard
const ESTADOS = {
  PEND: 2, // Pendiente
  APRO: 5, // Aprobada
  RECH: 6, // Rechazada
  CANC: 8, // Cancelada
};

// ===== Helpers de fechas / formato =====
const dayKeyFromAny = (x) => {
  if (!x) return '';
  // Acepta ISO, "YYYY-MM-DD HH:mm", Date, etc.
  const d = typeof x === 'string'
    ? (x.includes('T') || x.includes(' ') ? new Date(x) : new Date(`${x}T00:00:00`))
    : new Date(x);
  if (isNaN(d)) return '';
  // toISOString para llave estable (UTC); suficiente para un dashboard
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
};

const todayISO = () => dayKeyFromAny(new Date());
const weekStartISO = () => {
  const d = new Date();
  const dow = d.getDay(); // 0=Dom
  const diff = (dow === 0 ? 6 : dow - 1); // lunes como inicio
  d.setDate(d.getDate() - diff);
  return dayKeyFromAny(d);
};
const monthStartISO = () => {
  const d = new Date();
  d.setDate(1);
  return dayKeyFromAny(d);
};

const fmtDate = (iso) => (iso ? dayKeyFromAny(iso) : '—');
const fmtTime = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};
const pct = (n, d) => (!d ? '0%' : `${Math.round((n / d) * 100)}%`);

export default function AprobacionEstadisticas() {
  const [data, setData] = useState([]);
  const [desde, setDesde] = useState(monthStartISO());
  const [hasta, setHasta] = useState(todayISO());
  const [fTipo, setFTipo] = useState('');      // '', 'Espacio', 'Inmueble'
  const [fEstado, setFEstado] = useState('');  // '', '2','5','6','8'
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  const setRange = (key) => {
    const end = todayISO(); // hoy
    if (key === 'hoy')  { setDesde(end); setHasta(end); return; }
    if (key === 'sem')  { setDesde(weekStartISO()); setHasta(end); return; }
    if (key === 'mes')  { setDesde(monthStartISO()); setHasta(end); return; }
    if (key === '30d')  { const d = new Date(); d.setDate(d.getDate() - 30); setDesde(dayKeyFromAny(d)); setHasta(end); return; }

    // Últimos 12 meses exactos (hoy-1 año ... hoy)
    if (key === 'anio') {
      const d = new Date();
      const start = new Date(d);
      start.setFullYear(d.getFullYear() - 1);
      setDesde(dayKeyFromAny(start));
      setHasta(end);
      return;
    }
  };

  async function load() {
    setLoading(true);
    setError('');
    try {
      // 👇 sin localhost, usa helper (respeta REACT_APP_API_URL o same-origin)
      const arr = await getJSON('/api/reservas/listado');
      setData(Array.isArray(arr) ? arr : []);
    } catch (e) {
      setData([]);
      setError(e?.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // Normalización mínima por fila
  const normalized = useMemo(() => {
    return (data || []).map((r) => {
      const fecha_dia = dayKeyFromAny(r.hora_inicio || r.fecha_inicio || r.fecha);
      const tipo = r.inmueble_nombre ? 'Inmueble' : (r.espacio_nombre ? 'Espacio' : 'Otro');
      return { ...r, fecha_dia, tipo };
    });
  }, [data]);

  // Filtra por rango + tipo + estado (excluye completadas=4 SIEMPRE)
  const filtradas = useMemo(() => {
    // Corrige si usuario invirtió fechas
    const dMin = (desde && hasta && desde > hasta) ? hasta : desde;
    const dMax = (desde && hasta && desde > hasta) ? desde : hasta;

    return normalized.filter(r => {
      if (Number(r.estado_id) === 4) return false; // excluir Completadas (4)
      if (dMin && r.fecha_dia && r.fecha_dia < dMin) return false;
      if (dMax && r.fecha_dia && r.fecha_dia > dMax) return false;
      if (fTipo && r.tipo !== fTipo) return false;
      if (fEstado && String(r.estado_id) !== String(fEstado)) return false;
      return true;
    });
  }, [normalized, desde, hasta, fTipo, fEstado]);

  // Agregados (KPIs + series por día)
  const agg = useMemo(() => {
    const total = filtradas.length;
    const pend = filtradas.filter(x => Number(x.estado_id) === ESTADOS.PEND).length;
    const apro = filtradas.filter(x => Number(x.estado_id) === ESTADOS.APRO).length;
    const rech = filtradas.filter(x => Number(x.estado_id) === ESTADOS.RECH).length;
    const canc = filtradas.filter(x => Number(x.estado_id) === ESTADOS.CANC).length;

    const byDay = new Map();
    for (const r of filtradas) {
      const k = r.fecha_dia || '—';
      const o = byDay.get(k) || { total: 0, pend: 0, apro: 0, rech: 0, canc: 0 };
      o.total++;
      if (Number(r.estado_id) === ESTADOS.PEND) o.pend++;
      if (Number(r.estado_id) === ESTADOS.APRO) o.apro++;
      if (Number(r.estado_id) === ESTADOS.RECH) o.rech++;
      if (Number(r.estado_id) === ESTADOS.CANC) o.canc++;
      byDay.set(k, o);
    }
    const daysSorted = [...byDay.entries()].sort((a,b) => a[0].localeCompare(b[0]));
    const ndays = daysSorted.length || 1;
    const promedioDia = Math.round(total / ndays);

    return { total, pend, apro, rech, canc, byDay: daysSorted, promedioDia };
  }, [filtradas]);

  const maxDayTotal = useMemo(
    () => agg.byDay.reduce((m, [,v]) => Math.max(m, v.total), 0) || 1,
    [agg.byDay]
  );

  // ======= TOP 10 Recursos y Solicitantes =======
  const topRecursos = useMemo(() => {
    const m = new Map();
    for (const r of filtradas) {
      const nombre = r.inmueble_nombre || r.espacio_nombre || '—';
      m.set(nombre, (m.get(nombre) || 0) + 1);
    }
    return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  }, [filtradas]);

  const topSolicitantes = useMemo(() => {
    const m = new Map();
    for (const r of filtradas) {
      const nom = r.solicitante_nombre || '—';
      m.set(nom, (m.get(nom) || 0) + 1);
    }
    return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  }, [filtradas]);

  // ===== Exportar PDF =====
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 40;

    // Encabezado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Reporte de Aprobación de Reservas', marginX, 40);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const rangoTxt = `Rango: ${desde || '—'} a ${hasta || '—'}`;
    const filtrosTxt = [
      fTipo ? `Tipo: ${fTipo}` : null,
      fEstado ? `Estado: ${fEstado}` : null,
    ].filter(Boolean).join(' · ');
    doc.text(rangoTxt, marginX, 58);
    if (filtrosTxt) doc.text(filtrosTxt, marginX, 72);

    // Resumen ejecutivo
    autoTable(doc, {
      head: [['Resumen', 'Cantidad', '% sobre total']],
      body: [
        ['Total', String(agg.total), '—'],
        ['Pendientes (2)', String(agg.pend), pct(agg.pend, agg.total)],
        ['Aprobadas (5)', String(agg.apro), pct(agg.apro, agg.total)],
        ['Rechazadas (6)', String(agg.rech), pct(agg.rech, agg.total)],
        ['Canceladas (8)', String(agg.canc), pct(agg.canc, agg.total)],
        ['Promedio por día', String(agg.promedioDia), '—'],
      ],
      startY: 90,
      margin: { left: marginX, right: marginX },
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [13, 110, 253], textColor: 255, halign: 'center' },
      columnStyles: { 0: { cellWidth: 200 } },
    });

    // Detalle
    const head = [['ID', 'Fecha', 'Inicio', 'Fin', 'Recurso', 'Solicitante', 'Estado']];
    const body = (filtradas || []).map(r => ([
      String(r.id_reserva ?? '—'),
      fmtDate(r.fecha || r.hora_inicio),
      fmtTime(r.hora_inicio),
      fmtTime(r.hora_final),
      r.inmueble_nombre || r.espacio_nombre || '—',
      r.solicitante_nombre || '—',
      r.estado_nombre || String(r.estado_id || '—'),
    ]));

    autoTable(doc, {
      head,
      body,
      startY: doc.lastAutoTable.finalY + 16,
      margin: { left: marginX, right: marginX },
      styles: { fontSize: 9, cellPadding: 6, overflow: 'linebreak' },
      headStyles: { fillColor: [13, 110, 253], textColor: 255, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 60, halign: 'center' }, // ID
        1: { cellWidth: 80, halign: 'center' }, // Fecha
        2: { cellWidth: 60, halign: 'center' }, // Inicio
        3: { cellWidth: 60, halign: 'center' }, // Fin
        4: { cellWidth: 230 },                  // Recurso
        5: { cellWidth: 220 },                  // Solicitante
        6: { cellWidth: 90, halign: 'center' }, // Estado
      },
      didDrawPage: () => {
        const page = doc.internal.getNumberOfPages();
        doc.setFontSize(9);
        doc.text(
          `Página ${page}`,
          pageW - marginX,
          doc.internal.pageSize.getHeight() - 16,
          { align: 'right' }
        );
      }
    });

    const nombre = `aprobaciones_${(desde||'ini')}_${(hasta||'fin')}.pdf`.replaceAll(':','-');
    doc.save(nombre);
  };

  return (
    <div className="aprob-container">
      <div className="aprob-header">
        <div className="aprob-title">
          <h2>📊 Aprobación — Estadísticas</h2>
          <p className="aprob-sub">Indicadores del flujo de aprobación</p>
        </div>

        <div className="aprob-actions" style={{flexWrap:'wrap'}}>
          <div className="ranges" style={{display:'flex', gap:6, flexWrap:'wrap', marginRight:6}}>
            <button className="chip" onClick={()=>setRange('hoy')}>Hoy</button>
            <button className="chip" onClick={()=>setRange('sem')}>Semana</button>
            <button className="chip" onClick={()=>setRange('mes')}>Mes</button>
            <button className="chip" onClick={()=>setRange('30d')}>Últimos 30</button>
            <button className="chip" onClick={()=>setRange('anio')}>Año</button>
          </div>

          <input className="aprob-input" type="date" value={desde} onChange={(e)=>setDesde(e.target.value)} />
          <input className="aprob-input" type="date" value={hasta} onChange={(e)=>setHasta(e.target.value)} />

          <select className="aprob-input" value={fTipo} onChange={(e)=>setFTipo(e.target.value)}>
            <option value="">Tipo: Todos</option>
            <option value="Espacio">Espacio</option>
            <option value="Inmueble">Inmueble</option>
          </select>

          <select className="aprob-input" value={fEstado} onChange={(e)=>setFEstado(e.target.value)}>
            <option value="">Estado: Todos</option>
            <option value={ESTADOS.PEND}>Pendiente (2)</option>
            <option value={ESTADOS.APRO}>Aprobada (5)</option>
            <option value={ESTADOS.RECH}>Rechazada (6)</option>
            <option value={ESTADOS.CANC}>Cancelada (8)</option>
          </select>

          <button className="aprob-btn" onClick={load}>Actualizar</button>
          <button className="aprob-btn" onClick={exportPDF}>Exportar PDF</button>
        </div>
      </div>

      {error && <div className="aprob-alert aprob-alert--error">{error}</div>}

      {loading ? (
        <div className="aprob-empty">Cargando…</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="aprob-kpis">
            <div className="kpi-card k-total">
              <div className="kpi-title">Total</div>
              <div className="kpi-value">{agg.total}</div>
              <div className="kpi-title">Prom. por día: <b>{agg.promedioDia}</b></div>
            </div>

            <div className="kpi-card k-pend">
              <div className="kpi-title">Pendientes</div>
              <div className="kpi-value">{agg.pend}</div>
              <div className="kpi-title">{pct(agg.pend, agg.total)} del total</div>
            </div>

            <div className="kpi-card k-apro">
              <div className="kpi-title">Aprobadas</div>
              <div className="kpi-value">{agg.apro}</div>
              <div className="kpi-title">Tasa aprobación: <b>{pct(agg.apro, agg.total)}</b></div>
            </div>

            <div className="kpi-card k-rech">
              <div className="kpi-title">Rechazadas</div>
              <div className="kpi-value">{agg.rech}</div>
              <div className="kpi-title">Tasa rechazo: <b>{pct(agg.rech, agg.total)}</b></div>
            </div>

            <div className="kpi-card k-canc">
              <div className="kpi-title">Canceladas</div>
              <div className="kpi-value">{agg.canc}</div>
              <div className="kpi-title">{pct(agg.canc, agg.total)} del total</div>
            </div>
          </div>

          {/* Distribución por estado */}
          <div className="aprob-table" style={{marginTop:12}}>
            <div className="aprob-table-head" style={{gridTemplateColumns:'1fr'}}>
              Distribución por estado (100%)
            </div>
            <div className="aprob-table-body" style={{maxHeight:'unset'}}>
              <div className="aprob-row" style={{gridTemplateColumns:'1fr'}}>
                <div style={{display:'flex', gap:8, alignItems:'center'}}>
                  <div style={{display:'flex', width:'100%', height:14, borderRadius:999, overflow:'hidden', border:'1px solid #e5e7eb'}}>
                    <div title={`Pendientes ${pct(agg.pend, agg.total)}`} style={{width:pct(agg.pend,agg.total), background:'#fff7ed'}} />
                    <div title={`Aprobadas ${pct(agg.apro, agg.total)}`}   style={{width:pct(agg.apro,agg.total), background:'#ecfdf5'}} />
                    <div title={`Rechazadas ${pct(agg.rech,agg.total)}`}   style={{width:pct(agg.rech,agg.total), background:'#fef2f2'}} />
                    <div title={`Canceladas ${pct(agg.canc,agg.total)}`}   style={{width:pct(agg.canc,agg.total), background:'#f1f5f9'}} />
                  </div>
                  <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
                    <span className="aprob-badge e2">Pend {pct(agg.pend, agg.total)}</span>
                    <span className="aprob-badge e5">Apr {pct(agg.apro, agg.total)}</span>
                    <span className="aprob-badge e6">Rech {pct(agg.rech, agg.total)}</span>
                    <span className="aprob-badge e8">Canc {pct(agg.canc, agg.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tendencia diaria */}
          <div className="aprob-table" style={{marginTop:12}}>
            <div className="aprob-table-head" style={{gridTemplateColumns:'1fr'}}>
              Tendencia diaria (total de solicitudes por día)
            </div>
            <div className="aprob-table-body" style={{maxHeight:'unset'}}>
              {agg.byDay.length === 0 ? (
                <div className="aprob-row aprob-center">Sin datos en el rango</div>
              ) : (
                <div className="aprob-row" style={{gridTemplateColumns:'1fr'}}>
                  <div style={{display:'grid', gridAutoFlow:'column', alignItems:'end', gap:6, overflowX:'auto', paddingBottom:6}}>
                    {agg.byDay.map(([day, v]) => {
                      const h = Math.max(6, Math.round((v.total / maxDayTotal) * 72));
                      return (
                        <div key={day} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:6}}>
                          <div title={`${day}: ${v.total}`} style={{
                            width: 16,
                            height: h,
                            borderRadius: 4,
                            background: 'linear-gradient(180deg, #1e40af, #60a5fa)'
                          }} />
                          <div style={{fontSize:11, color:'#64748b'}}>{day.slice(5).replace('-','/')}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Top 10 (Recursos / Solicitantes) */}
          <div className="aprob-table" style={{marginTop:12}}>
            <div className="aprob-table-head" style={{display:'grid', gridTemplateColumns:'1fr 1fr'}}>
              <div>Top 10 Recursos</div>
              <div>Top 10 Solicitantes</div>
            </div>
            <div className="aprob-table-body" style={{maxHeight:'unset'}}>
              <div className="aprob-row" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:0}}>
                {/* Recursos */}
                <ol style={{margin:0, padding:'0 18px 0 22px', listStyle:'decimal'}}>
                  {topRecursos.map(([nom, cnt]) => (
                    <li key={nom} style={{
                      display:'grid',
                      gridTemplateColumns:'1fr auto',
                      padding:'10px 4px',
                      borderBottom:'1px solid #eef2f7'
                    }}>
                      <span>{nom}</span>
                      <b>{cnt}</b>
                    </li>
                  ))}
                  {topRecursos.length === 0 && <div style={{padding:'10px 0', color:'#667085', fontWeight:700}}>Sin datos</div>}
                </ol>

                {/* Solicitantes */}
                <ol style={{margin:0, padding:'0 18px 0 22px', listStyle:'decimal'}}>
                  {topSolicitantes.map(([nom, cnt]) => (
                    <li key={nom} style={{
                      display:'grid',
                      gridTemplateColumns:'1fr auto',
                      padding:'10px 4px',
                      borderBottom:'1px solid #eef2f7'
                    }}>
                      <span>{nom}</span>
                      <b>{cnt}</b>
                    </li>
                  ))}
                  {topSolicitantes.length === 0 && <div style={{padding:'10px 0', color:'#667085', fontWeight:700}}>Sin datos</div>}
                </ol>
              </div>
            </div>
          </div>

          {/* Top de días */}
          <div className="aprob-table" style={{marginTop:12}}>
            <div className="aprob-table-head" style={{display:'grid', gridTemplateColumns:'120px 1fr 1fr 1fr 1fr', gap:0}}>
              <div>Fecha</div>
              <div className="aprob-center">Total</div>
              <div className="aprob-center">Pend.</div>
              <div className="aprob-center">Aprob.</div>
              <div className="aprob-center">Rech.</div>
            </div>
            <div className="aprob-table-body">
              {agg.byDay.length === 0 ? (
                <div className="aprob-row aprob-center" style={{gridTemplateColumns:'1fr'}}>Sin datos</div>
              ) : (
                agg.byDay.map(([day, v]) => (
                  <div key={day} className="aprob-row" style={{display:'grid', gridTemplateColumns:'120px 1fr 1fr 1fr 1fr'}}>
                    <div>{day}</div>
                    <div className="aprob-center">{v.total}</div>
                    <div className="aprob-center">{v.pend}</div>
                    <div className="aprob-center">{v.apro}</div>
                    <div className="aprob-center">{v.rech}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
