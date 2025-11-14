// src/components/HistorialPagos.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2pdf from 'html2pdf.js';
import '../styles/RegistrarPago.css';

// ======= Constantes/Utils fuera del componente (consistentes con el proyecto) =======
const BASE_URL = (() => {
  const env = (process.env.REACT_APP_API_URL || '').trim();
  if (env) return env.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, port, origin } = window.location;
    if (port === '3000') return `${protocol}//${hostname}:5000`;
    return origin.replace(/\/$/, '');
  }
  return 'http://localhost:5000';
})();

const getToken = () => {
  const keys = ['auth', 'user', 'authUser'];
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') return parsed;
      if (parsed.access_token) return parsed.access_token;
      if (parsed.token) return parsed.token;
      if (parsed.jwt) return parsed.jwt;
    } catch {}
  }
  return localStorage.getItem('token') || localStorage.getItem('jwt') || null;
};

// Coloca el archivo del logo aquí: frontend/front-react/public/img/LogoSJP.jpg
const LOGO_SRC = '/img/LogoSJP.jpg';

// ===== Helpers de formato =====
const formatQ = (n) =>
  new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' })
    .format(Number(n ?? 0));

const fmtFecha = (d) =>
  d ? new Date(d).toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

const get = (o, k) => (o && o[k] !== undefined && o[k] !== null ? o[k] : undefined);

// =====================================================

export default function HistorialPagos() {
  // Fechas por defecto (mes actual)
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const firstDay = `${yyyy}-${mm}-01`;
  const todayStr = `${yyyy}-${mm}-${String(hoy.getDate()).padStart(2, '0')}`;

  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState(firstDay);
  const [hasta, setHasta] = useState(todayStr);
  const [q, setQ] = useState('');
  const [banner, setBanner] = useState(null);

  const abortRef = useRef(null);

  const aplicar = async () => {
    // Validación simple de fechas
    if (desde && hasta && new Date(desde) > new Date(hasta)) {
      setBanner({ type: 'error', text: 'El rango de fechas es inválido (Desde no puede ser mayor que Hasta).' });
      return;
    }
    setBanner(null);
    await fetchPagos();
  };

  // ===== Carga con filtros (server si existe; si no, filtra en cliente) =====
  const fetchPagos = async () => {
    abortRef.current?.abort?.();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const token = getToken();
      // Intento con filtros en servidor
      const url = new URL(`${BASE_URL}/api/pagos/listado`);
      if (desde) url.searchParams.set('desde', desde);
      if (hasta) url.searchParams.set('hasta', hasta);

      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) throw new Error('Ruta no disponible');
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      // Orden descendente por fecha
      arr.sort((a, b) => new Date(get(b, 'p_fecha') ?? get(b, 'fecha') ?? 0) - new Date(get(a, 'p_fecha') ?? get(a, 'fecha') ?? 0));
      setPagos(arr);
    } catch (e) {
      if (e.name === 'AbortError') return;
      // Fallback: pedir sin filtros y filtrar en cliente
      try {
        const token = getToken();
        const res2 = await fetch(`${BASE_URL}/api/pagos/listado`, {
          signal: controller.signal,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const data2 = await res2.json();
        const arr = Array.isArray(data2) ? data2 : [];
        const fd = desde ? new Date(desde) : null;
        const fh = hasta ? new Date(hasta) : null;
        const filtrado = arr.filter((p) => {
          const f = get(p, 'p_fecha') ?? get(p, 'fecha');
          if (!f) return false;
          const d = new Date(f);
          if (fd && d < fd) return false;
          if (fh && d > fh) return false;
          return true;
        });
        filtrado.sort((a, b) => new Date(get(b, 'p_fecha') ?? get(b, 'fecha') ?? 0) - new Date(get(a, 'p_fecha') ?? get(a, 'fecha') ?? 0));
        setPagos(filtrado);
      } catch (e2) {
        if (e2.name !== 'AbortError') {
          setPagos([]);
          setBanner({ type: 'error', text: 'No se pudieron cargar los pagos.' });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPagos();
    // cleanup abort
    return () => abortRef.current?.abort?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Filtro de texto en cliente =====
  const pagosFiltrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return pagos;
    return pagos.filter((p) => {
      const idPago = String(get(p, 'id_pago') ?? get(p, 'id') ?? '');
      const nroRes = String(get(p, 'id_reserva') ?? get(p, 'reserva_id_reserva') ?? '');
      const recurso = String(
        get(p, 'recurso_nombre') ??
        get(p, 'espacio_nombre') ??
        get(p, 'inmueble_nombre') ??
        get(p, 'recurso') ??
        ''
      ).toLowerCase();
      const ref = String(get(p, 'p_referencia') ?? get(p, 'referencia') ?? '').toLowerCase();
      return idPago.includes(qq) || nroRes.includes(qq) || recurso.includes(qq) || ref.includes(qq);
    });
  }, [pagos, q]);

  const total = useMemo(
    () => pagosFiltrados.reduce((a, p) => a + Number(get(p, 'p_monto') ?? get(p, 'monto') ?? 0), 0),
    [pagosFiltrados]
  );

  // ===== PDF de RECIBO (incluye fechas de reserva) =====
  const abrirRecibo = async (row) => {
    try {
      const idPago     = get(row, 'id_pago') ?? get(row, 'id');
      const nroRes     = get(row, 'id_reserva') ?? get(row, 'reserva_id_reserva');
      const recurso    = get(row, 'recurso_nombre') ?? get(row, 'espacio_nombre') ?? get(row, 'inmueble_nombre') ?? '-';
      const monto      = get(row, 'p_monto') ?? get(row, 'monto') ?? 0;
      const fechaPago  = get(row, 'p_fecha') ?? get(row, 'fecha') ?? '';

      // Fechas de reserva (según tu BD)
      const fechaSolicitud = get(row, 'r_fechareserva') ?? get(row, 'fecha_reserva') ?? '';
      const fechaInicio    = get(row, 'r_horainicio')    ?? get(row, 'hora_inicio')    ?? '';
      const fechaFinal     = get(row, 'r_horafinal')     ?? get(row, 'hora_final')     ?? '';
      const motivo         = get(row, 'r_motivouso')     ?? get(row, 'motivo')         ?? '-';

      const safeName = String(idPago ?? 'recibo').toString().replace(/[^\w.-]/g, '_');

      const html = `
        <div style="font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #111827;">
          <!-- Encabezado -->
          <div style="background:#0b63c7;color:#fff;padding:16px 20px;display:flex;align-items:center;gap:16px;">
            <img src="${LOGO_SRC}" crossorigin="anonymous"
                 style="height:60px;width:60px;object-fit:contain;border-radius:10px;background:#fff;padding:6px;box-shadow:0 0 4px rgba(0,0,0,.18)"/>
            <div style="flex:1">
              <div style="font-size:22px;font-weight:800;margin:0;">Municipalidad de San José Pinula</div>
              <div style="font-size:13px;opacity:.95;">Dirección Financiera — Tesorería Municipal</div>
            </div>
            <div style="text-align:right;font-size:14px;">
              <b>Recibo Oficial N.º:</b> ${idPago ?? '-'}<br/>
              <b>Fecha emisión:</b> ${fmtFecha(fechaPago)}
            </div>
          </div>

          <div style="padding:22px;">
            <!-- Bloque: Reserva -->
            <h3 style="margin:0 0 10px;border-bottom:2px solid #e5e7eb;padding-bottom:8px;color:#0b63c7;">
              📋 Detalle de la Reserva
            </h3>
            <table style="width:100%;border-collapse:collapse;margin-top:6px;">
              <tr><td style="padding:6px 0;width:220px;"><b>N.º Reserva:</b></td><td style="padding:6px 0;">#${nroRes ?? '-'}</td></tr>
              <tr><td style="padding:6px 0;"><b>Recurso:</b></td><td style="padding:6px 0;">${recurso}</td></tr>
              <tr><td style="padding:6px 0;"><b>📆 Fecha de solicitud:</b></td><td style="padding:6px 0;">${fmtFecha(fechaSolicitud)}</td></tr>
              <tr><td style="padding:6px 0;"><b>🕓 Fecha de inicio:</b></td><td style="padding:6px 0;">${fmtFecha(fechaInicio)}</td></tr>
              <tr><td style="padding:6px 0;"><b>🕕 Fecha final:</b></td><td style="padding:6px 0;">${fmtFecha(fechaFinal)}</td></tr>
              <tr><td style="padding:6px 0;"><b>Motivo de uso:</b></td><td style="padding:6px 0;">${motivo}</td></tr>
            </table>

            <!-- Bloque: Pago -->
            <h3 style="margin:18px 0 10px;color:#0b63c7;">💰 Detalle del Pago</h3>
            <table style="width:100%;border-collapse:collapse;margin-top:6px;">
              <tr><td style="padding:6px 0;width:220px;"><b>Monto recibido:</b></td><td style="padding:6px 0;">${formatQ(monto)}</td></tr>
              <tr><td style="padding:6px 0;"><b>Fecha de pago:</b></td><td style="padding:6px 0;">${fmtFecha(fechaPago)}</td></tr>
            </table>

            <!-- Firmas -->
            <div style="margin-top:34px;display:flex;justify-content:space-around;">
              <div style="text-align:center;">
                <div style="border-top:1px solid #cbd5e1;width:220px;margin:auto;margin-top:40px;"></div>
                <small>Firma del Solicitante</small>
              </div>
              <div style="text-align:center;">
                <div style="border-top:1px solid #cbd5e1;width:220px;margin:auto;margin-top:40px;"></div>
                <small>Firma del Encargado de Tesorería</small>
              </div>
            </div>

            <!-- Footer -->
            <div style="margin-top:34px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:12px;color:#555;display:flex;justify-content:space-between;">
              <span>© ${new Date().getFullYear()} Municipalidad de San José Pinula — Todos los derechos reservados</span>
              <span>Documento generado electrónicamente</span>
            </div>
          </div>
        </div>
      `;

      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-99999px';
      container.innerHTML = html;
      document.body.appendChild(container);

      await html2pdf()
        .set({
          margin: 0,
          filename: `ReciboOficial-${safeName}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .from(container)
        .save();

      container.remove();
    } catch (e) {
      console.error(e);
      alert('No se pudo generar el recibo.');
    }
  };

  // ===== UI =====
  return (
    <div className="registrar-pago-container">
      <div className="pagina-header">
        <div>
          <h2 className="titulo-pagina">📚 Historial de Pagos</h2>
          <p className="descripcion-pagina">Filtra por rango de fechas y busca por pago, reserva, recurso o referencia.</p>
        </div>
      </div>

      {banner && (
        <div
          className="mensaje"
          style={{
            marginBottom: 12,
            background: banner.type === 'error' ? '#fdecea' : '#e7f6ee',
            color: banner.type === 'error' ? '#b42318' : '#027a48',
            border: '1px solid',
            borderColor: banner.type === 'error' ? '#f5c2c7' : '#a6e3c5',
            padding: '10px 12px',
            borderRadius: 10,
          }}
        >
          {banner.text}
        </div>
      )}

      <div className="busqueda-filtros">
        <div className="busqueda-filtros-grid">
          <div className="campo-busqueda">
            <label className="label-busqueda">Desde</label>
            <input
              className="input-busqueda"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              onKeyDown={(e)=>{ if(e.key==='Enter') aplicar(); }}
            />
          </div>
          <div className="campo-busqueda">
            <label className="label-busqueda">Hasta</label>
            <input
              className="input-busqueda"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              onKeyDown={(e)=>{ if(e.key==='Enter') aplicar(); }}
            />
          </div>
          <div className="campo-busqueda">
            <label className="label-busqueda">Buscar</label>
            <input
              className="input-busqueda"
              placeholder="N° pago, reserva, recurso o referencia…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e)=>{ if(e.key==='Enter') aplicar(); }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'end' }}>
            <button className="btn-registrar-pago" onClick={aplicar} disabled={loading}>
              {loading ? '⏳ Cargando…' : '🔄 Aplicar'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'6px 2px' }}>
        <small style={{ color:'#64748b' }}>
          {pagosFiltrados.length} resultado{pagosFiltrados.length===1?'':'s'} • Total en vista: <b>{formatQ(total)}</b>
        </small>
      </div>

      <div className="tabla-contenedor">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>🔄 Cargando…</div>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla-reservas">
              <thead>
                <tr className="encabezado-tabla">
                  <th className="columna">N° Pago</th>
                  <th className="columna">N° Reserva</th>
                  <th className="columna">Recurso</th>
                  <th className="columna">Fecha</th>
                  <th className="columna">Monto</th>
                  <th className="columna-centrada">Recibo</th>
                </tr>
              </thead>
              <tbody>
                {pagosFiltrados.length === 0 ? (
                  <tr>
                    <td className="fila-sin-datos" colSpan={6}>📭 No hay resultados</td>
                  </tr>
                ) : (
                  pagosFiltrados.map((p) => {
                    const idPago = get(p, 'id_pago') ?? get(p, 'id');
                    const nroRes = get(p, 'id_reserva') ?? get(p, 'reserva_id_reserva');
                    const recurso = get(p, 'recurso_nombre') ?? get(p, 'espacio_nombre') ?? get(p, 'inmueble_nombre') ?? '-';
                    const fecha = get(p, 'p_fecha') ?? get(p, 'fecha') ?? '';
                    const monto = get(p, 'p_monto') ?? get(p, 'monto') ?? 0;
                    return (
                      <tr key={String(idPago)} className="fila-reserva">
                        <td className="dato-reserva">#{idPago}</td>
                        <td className="dato-reserva">#{nroRes}</td>
                        <td className="dato-reserva">{recurso}</td>
                        <td className="dato-reserva">{fecha ? fmtFecha(fecha) : '-'}</td>
                        <td className="dato-reserva monto-reserva">{formatQ(monto)}</td>
                        <td className="dato-reserva centrado">
                          <button className="btn-descargar" onClick={() => abrirRecibo(p)}>📄 Recibo</button>
                        </td>
                      </tr>
                    );
                  })
                )}
                {pagosFiltrados.length > 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>Total:</td>
                    <td className="dato-reserva monto-reserva">{formatQ(total)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
