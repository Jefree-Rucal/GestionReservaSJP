// src/components/ReporteFinanciero.jsx
import React, { useEffect, useMemo, useState } from 'react';
import html2pdf from 'html2pdf.js';
import '../styles/ReporteFinanciero.css';
import { getJSON } from '../utils/api';

const LOGO_SRC = '/img/LogoSJP.jpg'; // coloca el logo en public/img/LogoSJP.jpg

// Helpers de fecha en local (America/Guatemala)
const pad2 = (n) => String(n).padStart(2, '0');
const ymdLocal = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
};

export default function ReporteFinanciero() {
  const [loading, setLoading] = useState(true);
  const [serie, setSerie] = useState([]);          // [{dia:'YYYY-MM-DD', total:Number}]
  const [top, setTop] = useState([]);              // [{recurso, total}]
  const [hoyTotal, setHoyTotal] = useState(0);
  const [mesTotal, setMesTotal] = useState(0);     // total del rango elegido
  const [pagosCount, setPagosCount] = useState(0); // # de pagos en el rango

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  // Fechas base (local)
  const now = new Date();
  const firstDay = ymdLocal(new Date(now.getFullYear(), now.getMonth(), 1));
  const todayStr = ymdLocal(now);

  useEffect(() => {
    setDesde(firstDay);
    setHasta(todayStr);
  }, []); // init

  // Helpers de rango (local)
  const toISOdayLocal = (d) => ymdLocal(d); // normaliza a YYYY-MM-DD local
  const firstDayOfMonthLocal = (dt) => {
    const d = new Date(dt);
    return ymdLocal(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const addMonthsLocal = (dt, delta) => {
    const d = new Date(dt);
    d.setMonth(d.getMonth() + delta);
    return d;
  };

  // Presets de rango
  const setRango = (key) => {
    if (key === 'hoy') {
      setDesde(todayStr);
      setHasta(todayStr);
      return;
    }
    if (key === 'mes') {
      setDesde(firstDay);
      setHasta(todayStr);
      return;
    }
    if (key === '6m') {
      const start = firstDayOfMonthLocal(addMonthsLocal(now, -5)); // incluye mes actual
      setDesde(start);
      setHasta(todayStr);
      return;
    }
    if (key === '12m') {
      const start = firstDayOfMonthLocal(addMonthsLocal(now, -11));
      setDesde(start);
      setHasta(todayStr);
      return;
    }
  };

  const formatQ = (n) =>
    new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(Number(n ?? 0));

  const load = async () => {
    setLoading(true);
    try {
      // Traer pagos (sin localhost; el helper ya usa BASE_URL/env)
      const data = await getJSON('/api/pagos/listado');
      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];

      // Construir rango inclusivo por día local (00:00 a 23:59)
      const start = new Date(`${desde}T00:00:00`);
      const end   = new Date(`${hasta}T23:59:59`);

      const enRango = arr.filter((p) => {
        const f = p.p_fecha || p.fecha;
        if (!f) return false;
        const d = new Date(f);
        return d >= start && d <= end;
      });

      // Totales
      const hoyEnRango = enRango.filter(
        (p) => ymdLocal(p.p_fecha || p.fecha || '') === todayStr
      );
      const totalHoy = hoyEnRango.reduce((a, b) => a + Number(b.p_monto ?? b.monto ?? 0), 0);
      const totalRango = enRango.reduce((a, b) => a + Number(b.p_monto ?? b.monto ?? 0), 0);

      setHoyTotal(totalHoy);
      setMesTotal(totalRango);
      setPagosCount(enRango.length);

      // Serie por día (local)
      const map = new Map();
      enRango.forEach((p) => {
        const key = ymdLocal(p.p_fecha || p.fecha);
        map.set(key, (map.get(key) || 0) + Number(p.p_monto ?? p.monto ?? 0));
      });
      const s = Array.from(map, ([dia, total]) => ({ dia, total })).sort((a, b) => a.dia.localeCompare(b.dia));
      setSerie(s);

      // Top recursos
      const mapTop = new Map();
      enRango.forEach((p) => {
        const rec = p.recurso_nombre || p.espacio_nombre || p.inmueble_nombre || p.recurso || '—';
        mapTop.set(rec, (mapTop.get(rec) || 0) + Number(p.p_monto ?? p.monto ?? 0));
      });
      const topArr = Array.from(mapTop, ([recurso, total]) => ({ recurso, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
      setTop(topArr);
    } catch {
      setSerie([]);
      setTop([]);
      setHoyTotal(0);
      setMesTotal(0);
      setPagosCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [desde, hasta]);

  const maxBar = useMemo(() => Math.max(...serie.map((s) => s.total), 1), [serie]);

  // === PDF Bonito ===
  const imprimirReporte = () => {
    const money = (n) =>
      new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(Number(n || 0));
    const fDMY = (d) =>
      d ? new Date(d).toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
    const totalRango = Number(mesTotal ?? 0);
    const emitido = fDMY(new Date());
    const rangoTxt = `${fDMY(desde)} — ${fDMY(hasta)}`;

    const best = serie.length
      ? [...serie].sort((a, b) => b.total - a.total)[0]
      : null;

    const html = `
    <div class="sheet">
      <div class="hdr">
        <div class="logo"><img src="${LOGO_SRC}" alt="Logo" /></div>
        <div class="title">
          <h1>Municipalidad de San José Pinula</h1>
          <small>Dirección Financiera — Tesorería Municipal</small>
        </div>
        <div class="meta">
          <div><b>Reporte Financiero</b></div>
          <div>Rango: ${rangoTxt}</div>
          <div>Emitido: ${emitido}</div>
        </div>
      </div>
      <div class="content">
        <h2 class="sec">Indicadores Financieros</h2>
        <ul>
          <li><b>Recaudado hoy:</b> ${money(hoyTotal)}</li>
          <li><b>Total del rango:</b> ${money(totalRango)}</li>
          <li><b>Número de pagos:</b> ${pagosCount}</li>
          <li><b>Día pico:</b> ${best ? `${fDMY(best.dia)} (${money(best.total)})` : '—'}</li>
        </ul>

        <h2 class="sec">Top Recursos</h2>
        <div class="card">
          <table>
            <thead><tr><th>Recurso</th><th class="right">Total</th></tr></thead>
            <tbody>
              ${
                (top && top.length)
                  ? top.map(t => `<tr><td>${t.recurso}</td><td class="right">${money(t.total)}</td></tr>`).join('')
                  : `<tr><td colspan="2">Sin datos</td></tr>`
              }
            </tbody>
            <tfoot>
              <tr><td>Total</td><td class="right">${
                money(top.reduce((a,b)=>a+Number(b.total||0),0))
              }</td></tr>
            </tfoot>
          </table>
        </div>

        <h2 class="sec">Recaudación por Día</h2>
        <div class="card">
          <table>
            <thead><tr><th>Fecha</th><th class="right">Total</th></tr></thead>
            <tbody>
              ${
                (serie && serie.length)
                  ? serie.map(s => `<tr><td>${fDMY(s.dia)}</td><td class="right">${money(s.total)}</td></tr>`).join('')
                  : `<tr><td colspan="2">Sin datos</td></tr>`
              }
            </tbody>
            <tfoot><tr><td>Total del rango</td><td class="right">${money(totalRango)}</td></tr></tfoot>
          </table>
        </div>

        <div class="note">
          <b>Nota:</b> Reporte generado automáticamente por el Sistema de Gestión de Reservas y Pagos Municipales.
          Los valores están sujetos a revisión contable y conciliación bancaria.
        </div>
      </div>
      <div class="footer">© ${new Date().getFullYear()} Municipalidad de San José Pinula — Todos los derechos reservados.</div>
    </div>
    `;

    // estilos embebidos para el PDF (idénticos a los del HTML generado)
    const styles = `
      *{box-sizing:border-box}
      body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto;color:#0f172a;background:#f1f5f9}
      .sheet{max-width:860px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 10px 30px rgba(15,23,42,.12);overflow:hidden}
      .hdr{display:flex;align-items:center;gap:16px;background:#0ea5e9;color:#fff;padding:18px 22px}
      .hdr .logo{width:64px;height:64px;background:#fff;border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:hidden}
      .hdr .logo img{width:100%;height:100%;object-fit:cover}
      .hdr .title{flex:1}
      .hdr h1{margin:0;font-size:22px;line-height:1.2}
      .hdr small{opacity:.9}
      .hdr .meta{text-align:right;font-size:12px}
      .content{padding:28px}
      h2.sec{margin:18px 0 12px;color:#0f4b7e;font-size:18px}
      .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:14px}
      ul{margin:0;padding-left:20px}
      li{margin:4px 0}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{padding:10px 12px;font-size:14px;border-bottom:1px solid #eaeff5}
      thead th{background:#eef2ff;color:#0f172a;text-align:left;font-weight:800}
      .right{text-align:right}
      .note{margin-top:18px;font-size:12px;color:#475569}
      .footer{padding:14px 22px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#334155;text-align:center;font-size:12px}
      @page{margin:15mm}
    `;

    // contenedor temporal
    const container = document.createElement('div');
    const styleTag = document.createElement('style');
    styleTag.textContent = styles;
    container.appendChild(styleTag);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    container.appendChild(wrapper);

    document.body.appendChild(container);

    const page = container.querySelector('.sheet') || container;

    html2pdf()
      .set({
        margin: 10,
        filename: `ReporteFinanciero-${hasta || todayStr}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#fff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(page)
      .save()
      .then(() => container.remove())
      .catch(() => container.remove());
  };

  return (
    <div className="reporte-financiero-container">
      <div className="reporte-header">
        <h2 className="titulo-pagina">📊 Reporte Financiero</h2>
        <button className="btn-descargar" onClick={imprimirReporte}>🧾 Imprimir PDF</button>
      </div>

      {/* Filtros y presets */}
      <div className="filtros-reporte">
        <div className="campo">
          <label>Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="campo">
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>

        <div className="range-buttons">
          <button type="button" className="chip-btn" onClick={() => setRango('hoy')}>Hoy</button>
          <button type="button" className="chip-btn" onClick={() => setRango('mes')}>Mes actual</button>
          <button type="button" className="chip-btn" onClick={() => setRango('6m')}>Últ. 6 meses</button>
          <button type="button" className="chip-btn" onClick={() => setRango('12m')}>Últ. 12 meses</button>
        </div>

        <div className="acciones">
          <button className="btn-registrar-pago" onClick={load}>🔄 Actualizar</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>🔄 Cargando…</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-title">Recaudado Hoy</div>
              <div className="metric-value">{formatQ(hoyTotal)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-title">Recaudado en el Rango</div>
              <div className="metric-value">{formatQ(mesTotal)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-title">Top Recursos</div>
              <div className="metric-value">{top.length}</div>
            </div>
            <div className="metric-card">
              <div className="metric-title">Días Registrados</div>
              <div className="metric-value">{serie.length}</div>
            </div>
          </div>

          {/* Recaudación por día + Top recursos */}
          <div className="grid-charts">
            <div className="chart-card">
              <h3 className="chart-title">Recaudación por Día</h3>
              {serie.length === 0 ? (
                <div className="empty-report">Sin datos</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {serie.map((s) => (
                    <div key={s.dia}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{new Date(s.dia).toLocaleDateString('es-GT')}</span>
                        <b>{formatQ(s.total)}</b>
                      </div>
                      <div style={{ background: '#e2e8f0', height: 8, borderRadius: 9999 }}>
                        <div
                          style={{
                            width: `${(s.total / maxBar) * 100}%`,
                            height: '100%',
                            borderRadius: 9999,
                            background: 'linear-gradient(135deg,#0ea5e9,#0284c7)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="chart-card">
              <h3 className="chart-title">Top Recursos</h3>
              {top.length === 0 ? (
                <div className="empty-report">Sin datos</div>
              ) : (
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr><th>Recurso</th><th className="right">Total</th></tr>
                  </thead>
                  <tbody>
                    {top.map((t) => (
                      <tr key={t.recurso}>
                        <td>{t.recurso}</td>
                        <td className="right">{formatQ(t.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="reporte-footer">
            © {new Date().getFullYear()} Municipalidad de San José Pinula — Todos los derechos reservados.
          </div>
        </>
      )}
    </div>
  );
}
