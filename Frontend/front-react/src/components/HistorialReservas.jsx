import React, { useEffect, useMemo, useState, useCallback } from 'react';
import '../styles/HistorialReservas.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoSJP from '../Imagenes/LogoSJP.jpg';


const API_BASE = 'http://localhost:5000';
const api = (path) => `${API_BASE}${path}`;

const ESTADOS = { PENDIENTE: 2, APROBADA: 5, RECHAZADA: 6, CANCELADA: 8 };

const nombreEstado = (id) => {
  const n = Number(id);
  if (n === ESTADOS.PENDIENTE) return 'Pendiente';
  if (n === ESTADOS.APROBADA)  return 'Aprobada';
  if (n === ESTADOS.RECHAZADA) return 'Rechazada';
  if (n === ESTADOS.CANCELADA) return 'Cancelada';
  return '—';
};

export default function HistorialReservas() {
  // Filtros
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [tipo, setTipo] = useState('');       // '', 'inmueble', 'espacio'
  const [estado, setEstado] = useState('');   // '', '2','5','6'
  const [q, setQ] = useState('');
  const [orden, setOrden] = useState('recientes');

  // Datos - SIN PAGINACIÓN
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState({ type: null, text: '' });

  // Detalle
  const [detalle, setDetalle] = useState(null);

  // Logo para PDF
  const [logoDataUrl, setLogoDataUrl] = useState(null);

  // Helpers
  const showBanner = useCallback((type, text, ms = 3000) => {
    setBanner({ type, text });
    if (ms) setTimeout(() => setBanner({ type: null, text: '' }), ms);
  }, []);

  const parseJSONorThrowText = useCallback(async (response) => {
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('application/json')) return await response.json();
    const txt = await response.text();
    throw new Error(`Respuesta no-JSON (${response.status}): ${txt.slice(0, 180)}`);
  }, []);

  // Logo a dataURL
  useEffect(() => {
    const toDataURL = async (url) => {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch { return null; }
    };
    toDataURL(logoSJP).then(setLogoDataUrl);
  }, []);

  // Debounce búsqueda
  const [qDebounced, setQDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  // Querystring - SIN page y pageSize
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (desde) p.set('desde', desde);
    if (hasta) p.set('hasta', hasta);
    if (tipo) p.set('tipo', tipo);
    if (estado) p.set('estado', estado);
    if (qDebounced) p.set('q', qDebounced);
    if (orden) p.set('orden', orden);
    // Traer todas las reservas (sin límite)
    p.set('pageSize', '9999');
    return p.toString();
  }, [desde, hasta, tipo, estado, qDebounced, orden]);

  // Carga
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        setLoading(true);
        const resp = await fetch(api(`/api/reservas/historial?${qs}`));
        const data = await parseJSONorThrowText(resp);
        if (!resp.ok) throw new Error(data?.error || 'Error al cargar historial');
        if (!abort) {
          setItems(Array.isArray(data.items) ? data.items : []);
          setTotal(Number(data.total || 0));
        }
      } catch (err) {
        if (!abort) {
          setItems([]); setTotal(0);
          showBanner('error', err.message || 'Error al cargar historial');
        }
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => { abort = true; };
  }, [qs, parseJSONorThrowText, showBanner]);

  // Helpers de formato
  const resetFiltros = () => {
    setDesde(''); setHasta(''); setTipo(''); setEstado(''); setQ(''); setOrden('recientes');
  };

  const toLocalDate = (iso) => iso ? new Date(iso).toLocaleDateString() : '—';
  const toLocalTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  const toLocalDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };
  const durationText = (ini, fin) => {
    if (!ini || !fin) return '';
    const ms = new Date(fin) - new Date(ini);
    if (ms <= 0) return '';
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  };

  const normTipo = (t) => {
    const v = (t ?? '').toString().trim().toLowerCase();
    if (['inmueble', 'mueble', 'i', '1'].includes(v)) return 'inmueble';
    if (['espacio', 'espacios', 'e', '2'].includes(v)) return 'espacio';
    return '';
  };
  const tipoLabel = (t) => (normTipo(t) === 'inmueble' ? 'Inmueble' : normTipo(t) === 'espacio' ? 'Espacio' : '—');

  // ===========================
  // Exportar tabla (PDF)
  // ===========================
  const exportPDF = async () => {
    if (!items.length) return showBanner('error', 'No hay datos para exportar');

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = { top: 30, left: 12, right: 12, bottom: 14 };

    const drawHeaderFooter = () => {
      try { if (logoDataUrl) doc.addImage(logoDataUrl, 'JPEG', margin.left, 8, 22, 22); } catch {}
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
      doc.text('Municipalidad de San José Pinula', margin.left + 26, 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(12);
      doc.text('Historial de Reservas', margin.left + 26, 21);

      doc.setFontSize(9);
      const filtros = [
        desde && `Desde: ${desde}`,
        hasta && `Hasta: ${hasta}`,
        tipo && `Tipo: ${tipoLabel(tipo)}`,
        `Estado: ${estado ? nombreEstado(estado) : 'Todos'}`,
        qDebounced && `Búsqueda: "${qDebounced}"`
      ].filter(Boolean).join('  |  ');
      if (filtros) doc.text(filtros, margin.left + 26, 27);

      doc.text(new Date().toLocaleString(), pageW - margin.right, 12, { align: 'right' });
      const str = `Página ${doc.internal.getNumberOfPages()}`;
      doc.text(str, pageW - margin.right, pageH - 6, { align: 'right' });
    };

    const body = items.map(r => ({
      id: r.id_reserva,
      fecha: toLocalDate(r.hora_inicio || r.fecha),
      inicio: toLocalTime(r.hora_inicio),
      fin: toLocalTime(r.hora_final),
      tipo: tipoLabel(r.tipo),
      recurso: r.inmueble_nombre || r.espacio_nombre || '—',
      solicitante: r.solicitante_nombre || '—',
      estado: nombreEstado(r.estado_id),
      cantidad: r.cantidad_reserva ?? ''
    }));

    autoTable(doc, {
      columns: [
        { header: 'ID', dataKey: 'id' },
        { header: 'Fecha', dataKey: 'fecha' },
        { header: 'Inicio', dataKey: 'inicio' },
        { header: 'Fin', dataKey: 'fin' },
        { header: 'Tipo', dataKey: 'tipo' },
        { header: 'Recurso', dataKey: 'recurso' },
        { header: 'Solicitante', dataKey: 'solicitante' },
        { header: 'Estado', dataKey: 'estado' },
        { header: 'Cant.', dataKey: 'cantidad' },
      ],
      body,
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [246, 248, 255] },
      startY: margin.top + 4,
      margin: { top: margin.top, left: margin.left, right: margin.right, bottom: margin.bottom },
      columnStyles: {
        id: { cellWidth: 12, halign: 'right' },
        fecha: { cellWidth: 22 },
        inicio: { cellWidth: 18 },
        fin: { cellWidth: 18 },
        tipo: { cellWidth: 22 },
        recurso: { cellWidth: 58 },
        solicitante: { cellWidth: 48 },
        estado: { cellWidth: 26 },
        cantidad: { cellWidth: 16, halign: 'right' }
      },
      didDrawPage: drawHeaderFooter,
    });

    doc.save(`historial_reservas_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  // ===========================
  // Recibo (layout centrado y limpio)
  // ===========================
  async function generarRecibo(r) {
    // 1) Traer detalle completo
    let extra = {};
    try {
      const resp = await fetch(api(`/api/reservas/detalle/${r.id_reserva}`));
      if (resp.ok) extra = (await resp.json()) || {};
    } catch {}

    // 2) Helpers
    const getFirst = (...vals) => {
      for (const v of vals) {
        if (v !== undefined && v !== null && String(v).trim() !== '' && String(v).toLowerCase().trim() !== 'null') {
          return v;
        }
      }
      return '—';
    };
    const _toLocalDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : '—');
    const _toLocalTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');

    // 3) Datos (igualando la plantilla de CrearReserva)
    const solicitante = getFirst(extra.solicitante_nombre, r.solicitante_nombre);
    const dpi         = getFirst(extra.solicitante_dpi, r.solicitante_dpi);
    const tel         = getFirst(extra.solicitante_telefono, r.solicitante_telefono);
    const correo      = getFirst(extra.solicitante_correo, r.solicitante_correo, r.email);
    const motivo      = getFirst(extra.motivo_uso, extra.r_motivouso, r.motivo_uso, r.r_motivouso, r.motivo);

    const recurso     = getFirst(r.inmueble_nombre, r.espacio_nombre, extra.nombre_recurso);

    const fechaInicio = _toLocalDate(getFirst(r.hora_inicio, extra.hora_inicio));
    const fechaFinal  = _toLocalDate(getFirst(r.hora_final,  extra.hora_final));
    const horaInicio  = _toLocalTime(getFirst(r.hora_inicio, extra.hora_inicio));
    const horaFinal   = _toLocalTime(getFirst(r.hora_final,  extra.hora_final));

    const estadoNom   = nombreEstado(r.estado_id);
    const cantidad    = getFirst(r.cantidad_reserva, extra.cantidad_reserva, 1);

    // 4) PDF
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    // Márgenes más equilibrados
    const M = { t: 18, l: 16, r: 16 };
    const contentW = W - M.l - M.r;

    // Encabezado (barra azul centrada)
    doc.setFillColor(10, 63, 130);
    doc.rect(0, 0, W, 26, 'F');

    // Logo
    try { if (logoDataUrl) doc.addImage(logoDataUrl, 'JPEG', M.l, 3, 20, 20); } catch {}

    // Títulos
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.text('Municipalidad de San José Pinula', M.l + 26, 10);
    doc.setFont('helvetica','normal'); doc.setFontSize(10);
    doc.text('Dirección Financiera — Tesorería Municipal', M.l + 26, 16);

    // Datos arriba a la derecha
    doc.setFont('helvetica','bold'); doc.setFontSize(10);
    doc.text(`Reserva N.º: ${r.id_reserva}`, W - M.r, 8, { align: 'right' });
    doc.setFont('helvetica','normal');
    doc.text(`Fecha emisión: ${new Date().toLocaleDateString()}`, W - M.r, 14, { align: 'right' });

    // Restablecer color
    doc.setTextColor(0,0,0);

    // Helper: cabecera de sección
    const sectionHeader = (title, y) => {
      doc.setFont('helvetica','bold'); doc.setFontSize(12);
      doc.setDrawColor(230); doc.setFillColor(248);
      doc.roundedRect(M.l, y, contentW, 9, 2, 2, 'F');
      doc.text(title, M.l + 6, y + 6);
      return y + 12;
    };

    // Ancho de columnas de la tabla (etiqueta/valor)
    const labelW = 44; // ancho cómodo para etiquetas largas
    const tableWidth = contentW;

    // 5) Sección: Datos de la reserva
    let y = sectionHeader('Datos de la reserva', M.t + 12);
    autoTable(doc, {
      startY: y,
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 2.5 },
      margin: { left: M.l, right: M.r },
      tableWidth,
      columnStyles: {
        0: { cellWidth: labelW, fontStyle: 'bold' },
        1: { cellWidth: tableWidth - labelW }
      },
      body: [
        ['N° de Reserva', `#${r.id_reserva}`],
        ['Estado', estadoNom],
        ['Solicitante', String(solicitante)],
        ['DPI', String(dpi)],
        ['Teléfono', String(tel)],
        ['Correo', String(correo)],
      ]
    });
    y = doc.lastAutoTable.finalY + 8;

    // 6) Sección: Recurso y horario
    y = sectionHeader('Recurso y horario', y);
    autoTable(doc, {
      startY: y,
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 2.5 },
      margin: { left: M.l, right: M.r },
      tableWidth,
      columnStyles: {
        0: { cellWidth: labelW, fontStyle: 'bold' },
        1: { cellWidth: tableWidth - labelW }
      },
      body: [
        ['Recurso', String(recurso)],
        ['Fecha inicio', String(fechaInicio)],
        ['Fecha final', String(fechaFinal)],
        ['Hora inicio', String(horaInicio)],
        ['Hora fin', String(horaFinal)],
        ['Cantidad', String(cantidad)],
      ]
    });
    y = doc.lastAutoTable.finalY + 8;

    // 7) Sección: Motivo de uso
    y = sectionHeader('Motivo de uso', y);
    autoTable(doc, {
      startY: y,
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 2.5 },
      margin: { left: M.l, right: M.r },
      tableWidth,
      columnStyles: {
        0: { cellWidth: labelW, fontStyle: 'bold' },
        1: { cellWidth: tableWidth - labelW }
      },
      body: [
        ['Motivo', String(motivo)]
      ]
    });

    // Footer
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text('© 2025 Municipalidad de San José Pinula — Documento generado electrónicamente', M.l, H - 10);

    // Guardar
    doc.save(`reserva_${r.id_reserva}.pdf`);
  }

  return (
    <div className="historial-container">
      <h2 className="titulo-historial">📚 Historial de Reservas</h2>

      {banner.type && (
        <div className={`hist-alert ${banner.type === 'error' ? 'hist-alert--error' : 'hist-alert--ok'}`}>
          {banner.text}
        </div>
      )}

      {/* Filtros */}
      <div className="filtros">
        <div className="grupo">
          <label>Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="grupo">
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="grupo">
          <label>Tipo</label>
          <select value={tipo} onChange={(e)=> setTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="inmueble">Muebles</option>
            <option value="espacio">Espacios Públicos</option>
          </select>
        </div>
        <div className="grupo">
          <label>Estado</label>
          <select value={estado} onChange={(e)=> setEstado(e.target.value)}>
          <option value="">Todos</option>
          <option value="2">Pendiente</option>
          <option value="5">Aprobada</option>
          <option value="6">Rechazada</option>
          <option value="8">Cancelada</option> 
        </select>
        </div>
        <div className="grupo grow">
          <label>Buscar</label>
          <input
            type="search"
            placeholder="Solicitante, recurso o ID…"
            value={q}
            onChange={(e)=> setQ(e.target.value)}
          />
        </div>
        <div className="grupo">
          <label>Orden</label>
          <select value={orden} onChange={(e)=> setOrden(e.target.value)}>
            <option value="recientes">Más recientes</option>
            <option value="antiguos">Más antiguos</option>
          </select>
        </div>
        <div className="acciones">
          <button className="btn" onClick={resetFiltros}>Limpiar</button>
          <button className="btn btn-pdf" onClick={exportPDF}>Exportar PDF</button>
        </div>
      </div>

      {/* Resumen */}
      <div className="resumen">
        <div className="chip">Total de reservas: <strong>{total}</strong></div>
        <div className="chip">Mostrando: <strong>{items.length}</strong></div>
      </div>

      {/* Tabla con SCROLL */}
      <div className="tabla-wrap">
        <table className="tabla">
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Tipo</th>
              <th>Recurso</th>
              <th>Solicitante</th>
              <th>Estado</th>
              <th>Cant.</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && items.length === 0 && (
              <tr><td colSpan="10" className="sin-datos">No se encontraron reservas</td></tr>
            )}
            {loading && (
              <tr><td colSpan="10" className="sin-datos">Cargando…</td></tr>
            )}
            {!loading && items.map(r => (
              <tr key={r.id_reserva} className={`estado-${r.estado_id}`}>
                <td>#{r.id_reserva}</td>
                <td>{toLocalDate(r.hora_inicio || r.fecha)}</td>
                <td>{toLocalTime(r.hora_inicio)}</td>
                <td>{toLocalTime(r.hora_final)}</td>
                <td><span className={`pill pill-${normTipo(r.tipo)}`}>{tipoLabel(r.tipo)}</span></td>
                <td>{r.inmueble_nombre || r.espacio_nombre || '—'}</td>
                <td>{r.solicitante_nombre || '—'}</td>
                <td><span className={`badge badge-${r.estado_id}`}>{nombreEstado(r.estado_id)}</span></td>
                <td>{r.cantidad_reserva ?? '—'}</td>
                <td style={{display:'flex', gap:8}}>
                  <button className="btn-mini" onClick={()=> setDetalle(r)} title="Ver detalle">👁️</button>
                  <button className="btn-mini" onClick={()=> generarRecibo(r)} title="Generar recibo">🧾</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal detalle */}
      {detalle && (
        <div className="modal-backdrop" onClick={()=> setDetalle(null)}>
          <div className="modal" onClick={(e)=> e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reserva #{detalle.id_reserva}</h3>
              <button className="modal-close" onClick={()=> setDetalle(null)}>×</button>
            </div>
            <div className="modal-body">
              <p><strong>Solicitante:</strong> {detalle.solicitante_nombre || '—'}</p>
              <p><strong>Tipo:</strong> <span className={`pill pill-${normTipo(detalle.tipo)}`}>{tipoLabel(detalle.tipo)}</span></p>
              <p><strong>Recurso:</strong> {detalle.inmueble_nombre || detalle.espacio_nombre || '—'}</p>

              <div className="rango-box">
                <div><strong>Rango de reserva:</strong></div>
                <div className="rango-line">
                  <span className="rango-chip">Inicio</span>
                  <span>{toLocalDateTime(detalle.hora_inicio)}</span>
                </div>
                <div className="rango-line">
                  <span className="rango-chip">Fin</span>
                  <span>{toLocalDateTime(detalle.hora_final)}</span>
                </div>
                <div className="rango-duracion">
                  <em>Duración:</em> {durationText(detalle.hora_inicio, detalle.hora_final) || '—'}
                </div>
              </div>
              <p><strong>Estado:</strong> {nombreEstado(detalle.estado_id)}</p>
              {detalle.cantidad_reserva != null && <p><strong>Cantidad:</strong> {detalle.cantidad_reserva}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=> setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}