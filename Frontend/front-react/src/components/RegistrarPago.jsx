// src/components/RegistrarPago.jsx
import React, { useEffect, useMemo, useState } from 'react';
import html2pdf from 'html2pdf.js';
import '../styles/RegistrarPago.css';
import { getJSON } from '../utils/api';

const LOGO_SRC = '/img/LogoSJP.jpg'; // pon tu logo en public/img/LogoSJP.jpg

export default function RegistrarPago() {
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState(null);

  const safe = (v, d = '') => (v === null || v === undefined ? d : v);
  const formatQ = (n) =>
    new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', minimumFractionDigits: 2 })
      .format(Number(n ?? 0));
  const fmtFecha = (d) =>
    d ? new Date(d).toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
  const fmtHora = (d) =>
    d ? new Date(d).toLocaleTimeString('es-GT', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '-';

  // ===== Cargar historial (ahora usando getJSON, sin localhost) =====
  const fetchPagos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getJSON('/api/pagos/listado');
      // puede venir como array o {items:[]}
      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      setPagos(arr);
    } catch (err) {
      console.error('Error cargando pagos:', err);
      setError('No se pudo obtener el historial de pagos.');
      setPagos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPagos();
  }, []);

  // ===== Filtro =====
  const pagosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return pagos;
    return pagos.filter((p) => {
      const idPago = String(safe(p.id_pago, ''));
      const idReserva = String(safe(p.reserva_id_reserva, ''));
      const recurso = String(safe(p.recurso_nombre, '')).toLowerCase();
      const tipo = String(safe(p.recurso_tipo, '')).toLowerCase();
      const referencia = String(safe(p.p_referencia, '')).toLowerCase();
      return (
        idPago.includes(q) ||
        idReserva.includes(q) ||
        recurso.includes(q) ||
        tipo.includes(q) ||
        referencia.includes(q)
      );
    });
  }, [pagos, busqueda]);

  const totalPagos = pagosFiltrados.length;
  const totalRecaudado = useMemo(
    () => pagosFiltrados.reduce((acc, p) => acc + Number(safe(p.p_monto, 0)), 0),
    [pagosFiltrados]
  );

  // ===== Construir nodo HTML con clases del CSS y generar PDF =====
  const descargarReciboPDF = async (row) => {
    try {
      const idPago = safe(row.id_pago, '');
      const nroReserva = safe(row.reserva_id_reserva, '');
      const recurso = safe(row.recurso_nombre, '-');
      const tipo = safe(row.recurso_tipo, 'Recurso');
      const monto = safe(row.p_monto, 0);
      const fechaPago = safe(row.p_fecha, '');

      // Fechas importantes
      const fechaSolicitud = safe(row.fecha_reserva || row.r_fechareserva, '');
      const fechaInicio = safe(row.hora_inicio || row.r_horainicio, '');
      const fechaFinal = safe(row.hora_final || row.r_horafinal, '');
      const motivo = safe(row.motivo || row.r_motivouso, '');

      // Datos del solicitante
      const sNombre = safe(row.s_nombre || row.solicitante_nombre, '');
      const sDpi = safe(row.s_dpi || row.solicitante_dpi, '');
      const sTelefono = safe(row.s_telefono || row.solicitante_telefono, '');
      const sCorreo = safe(row.s_correo || row.solicitante_correo, '');

      // contenedor oculto (si no existe aún)
      let root = document.getElementById('recibo-print-root');
      if (!root) {
        root = document.createElement('div');
        root.id = 'recibo-print-root';
        document.body.appendChild(root);
      }

      // nodo de recibo (con clases del CSS)
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div class="recibo-page">
          <div class="recibo-body">
            <div class="recibo-header">
              <div class="recibo-logo">
                <img src="${LOGO_SRC}" alt="Logo Municipalidad"/>
              </div>
              <div class="recibo-titlewrap">
                <div class="sub">Municipalidad de San José Pinula</div>
                <h1>Recibo informativo</h1>
              </div>
              <div class="recibo-meta">
                <div><b>N.º Recibo:</b> #${idPago}</div>
                <div><b>Fecha de emisión:</b> ${fmtFecha(fechaPago)}</div>
              </div>
            </div>

            <div class="recibo-section">
              <div class="title">📅 Detalle de la solicitud</div>
              <div class="body">
                <div class="recibo-kv">
                  <div><b>N.º Reserva:</b> #${nroReserva}</div>
                  <div><b>Tipo:</b> ${tipo}</div>
                  <div><b>Recurso:</b> ${recurso}</div>
                  <div><b>📆 Fecha de solicitud:</b> ${fmtFecha(fechaSolicitud)}</div>
                  <div><b>🕓 Fecha de inicio:</b> ${fmtFecha(fechaInicio)}</div>
                  <div><b>🕕 Fecha final:</b> ${fmtFecha(fechaFinal)}</div>
                  <div><b>Horario:</b> ${fmtHora(fechaInicio)} — ${fmtHora(fechaFinal)}</div>
                  <div class="recibo-full recibo-motive"><b>Motivo:</b> ${motivo || '-'}</div>
                </div>
              </div>
            </div>

            <div class="recibo-section">
              <div class="title">👤 Solicitante</div>
              <div class="body">
                <div class="recibo-kv">
                  <div><b>Nombre:</b> ${sNombre || '-'}</div>
                  <div><b>DPI:</b> ${sDpi || '-'}</div>
                  <div><b>Teléfono:</b> ${sTelefono || '-'}</div>
                  <div><b>Correo:</b> ${sCorreo || '-'}</div>
                </div>
              </div>
            </div>

            <div class="recibo-total">💰 Monto registrado: ${formatQ(monto)}</div>

            <div class="recibo-firmas">
              <div class="box">
                <div class="line"></div>
                <small>Firma del solicitante</small>
              </div>
              <div class="box">
                <div class="line"></div>
                <small>Encargado Municipal</small>
              </div>
            </div>
          </div>

          <div class="recibo-footer">
            <div>Este comprobante es informativo y forma parte del historial de pagos del sistema de Reservas.</div>
            <div>© ${new Date().getFullYear()} Municipalidad de San José Pinula — Todos los derechos reservados.</div>
          </div>
        </div>
      `;
      const pageNode = wrapper.firstElementChild;
      root.appendChild(pageNode);

      // deja que el navegador pinte el nodo con su CSS
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      await html2pdf()
        .set({
          margin: 0,
          filename: `Recibo-${idPago}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#fff',
            removeContainer: true,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(pageNode)
        .save();

      // limpieza
      pageNode.remove();
    } catch (err) {
      console.error('Error generando PDF:', err);
      alert('No se pudo generar el recibo.');
    }
  };

  // ===== UI =====
  return (
    <div className="registrar-pago-container">
      <div className="pagina-header">
        <div>
          <h2 className="titulo-pagina">💳 Historial de Pagos</h2>
          <p className="descripcion-pagina">
            Registro informativo de los pagos generados automáticamente al crear reservas o ingresados manualmente.
          </p>
        </div>
      </div>

      <div className="busqueda-filtros">
        <div className="busqueda-filtros-grid">
          <div className="campo-busqueda">
            <label className="label-busqueda">🔍 Buscar</label>
            <input
              className="input-busqueda"
              placeholder="N° pago, N° reserva, recurso, tipo o referencia…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          <div className="campo-filtro" style={{ alignSelf: 'end' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              Total registros: {totalPagos} • Monto total registrado: {formatQ(totalRecaudado)}
            </div>
            <button type="button" onClick={fetchPagos} className="btn-descargar" title="Actualizar historial">
              🔄 Actualizar
            </button>
          </div>
        </div>
      </div>

      <div className="tabla-contenedor">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>🔄 Cargando historial…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#e74c3c' }}>{error}</div>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla-reservas">
              <thead>
                <tr className="encabezado-tabla">
                  <th className="columna">N° Pago</th>
                  <th className="columna">N° Reserva</th>
                  <th className="columna">Recurso</th>
                  <th className="columna">Tipo</th>
                  <th className="columna">Fecha</th>
                  <th className="columna">Monto</th>
                  <th className="columna-centrada">Recibo</th>
                </tr>
              </thead>
              <tbody>
                {pagosFiltrados.length === 0 ? (
                  <tr>
                    <td className="fila-sin-datos" colSpan={7}>
                      📭 No hay registros informativos disponibles
                    </td>
                  </tr>
                ) : (
                  pagosFiltrados.map((p) => (
                    <tr key={p.id_pago} className="fila-reserva">
                      <td className="dato-reserva">#{p.id_pago}</td>
                      <td className="dato-reserva">#{p.reserva_id_reserva}</td>
                      <td className="dato-reserva">{p.recurso_nombre}</td>
                      <td className="dato-reserva">{p.recurso_tipo}</td>
                      <td className="dato-reserva">{p.p_fecha ? fmtFecha(p.p_fecha) : '-'}</td>
                      <td className="dato-reserva monto-reserva">{formatQ(p.p_monto)}</td>
                      <td className="dato-reserva centrado">
                        <button className="btn-descargar" onClick={() => descargarReciboPDF(p)}>
                          📄 Recibo
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* raíz oculta para inyectar el HTML del PDF */}
      <div id="recibo-print-root" />
    </div>
  );
}
