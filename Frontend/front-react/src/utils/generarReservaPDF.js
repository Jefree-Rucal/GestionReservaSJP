// src/utils/generarReservaPDF.js
import html2pdf from 'html2pdf.js';

const LOGO_SRC = '/img/LogoSJP.jpg';

const fmtFecha = (d) =>
  d ? new Date(d).toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

const fmtHora = (d) =>
  d ? new Date(d).toLocaleTimeString('es-GT', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '-';

export async function generarReservaPDF({
  idReserva,
  idPago,
  recursoNombre,
  tipoRecurso,
  fechaSolicitud,
  fechaInicio,
  fechaFinal,
  motivo,
  solicitante, // { nombre, dpi, telefono, correo }
  monto,
  fechaPago
}) {
  const html = `
    <div style="font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:#111827; max-width:800px; margin:0 auto;">
      <!-- Header -->
      <div style="background:#0b63c7;color:#fff;padding:16px 20px;display:flex;align-items:center;gap:16px;">
        <img src="${LOGO_SRC}" crossorigin="anonymous"
             style="height:60px;width:60px;object-fit:contain;border-radius:10px;background:#fff;padding:6px;box-shadow:0 0 4px rgba(0,0,0,.18)"/>
        <div style="flex:1">
          <div style="font-size:22px;font-weight:800;margin:0;">Municipalidad de San José Pinula</div>
          <div style="font-size:13px;opacity:.95;">Dirección Financiera — Tesorería Municipal</div>
        </div>
        <div style="text-align:right;font-size:14px;">
          <b>Reserva N.º:</b> ${idReserva ?? '-'}<br/>
          <b>Fecha emisión:</b> ${fmtFecha(new Date())}
        </div>
      </div>

      <div style="padding:22px;">
        <!-- Detalle reserva -->
        <h3 style="margin:0 0 10px;border-bottom:2px solid #e5e7eb;padding-bottom:8px;color:#0b63c7;">📋 Detalle de la Reserva</h3>
        <table style="width:100%;border-collapse:collapse;margin-top:6px;">
          <tr><td style="padding:6px 0;width:220px;"><b>N.º Reserva:</b></td><td style="padding:6px 0;">#${idReserva ?? '-'}</td></tr>
          <tr><td style="padding:6px 0;"><b>Recurso:</b></td><td style="padding:6px 0;">${recursoNombre} <span style="opacity:.7">(${tipoRecurso})</span></td></tr>
          <tr><td style="padding:6px 0;"><b>📆 Fecha de solicitud:</b></td><td style="padding:6px 0;">${fmtFecha(fechaSolicitud)}</td></tr>
          <tr><td style="padding:6px 0;"><b>🕓 Fecha de inicio:</b></td><td style="padding:6px 0;">${fmtFecha(fechaInicio)} ${fmtHora(fechaInicio)}</td></tr>
          <tr><td style="padding:6px 0;"><b>🕕 Fecha final:</b></td><td style="padding:6px 0;">${fmtFecha(fechaFinal)} ${fmtHora(fechaFinal)}</td></tr>
          <tr><td style="padding:6px 0;"><b>Motivo:</b></td><td style="padding:6px 0;">${motivo || '-'}</td></tr>
        </table>

        <!-- Solicitante -->
        <h3 style="margin:18px 0 10px;color:#0b63c7;">👤 Solicitante</h3>
        <table style="width:100%;border-collapse:collapse;margin-top:6px;">
          <tr><td style="padding:6px 0;width:220px;"><b>Nombre:</b></td><td style="padding:6px 0;">${solicitante?.nombre || '-'}</td></tr>
          <tr><td style="padding:6px 0;"><b>DPI:</b></td><td style="padding:6px 0;">${solicitante?.dpi || '-'}</td></tr>
          <tr><td style="padding:6px 0;"><b>Teléfono:</b></td><td style="padding:6px 0;">${solicitante?.telefono || '-'}</td></tr>
          <tr><td style="padding:6px 0;"><b>Correo:</b></td><td style="padding:6px 0;">${solicitante?.correo || '-'}</td></tr>
        </table>

        <!-- Pago (si aplica) -->
        <h3 style="margin:18px 0 10px;color:#0b63c7;">💰 Detalle del Pago</h3>
        <table style="width:100%;border-collapse:collapse;margin-top:6px;">
          <tr>
            <td style="padding:6px 0;width:220px;"><b>Monto registrado:</b></td>
            <td style="padding:6px 0;">
              ${
                monto
                  ? new Intl.NumberFormat('es-GT', {
                      style: 'currency',
                      currency: 'GTQ',
                    }).format(monto)
                  : '—'
              }
            </td>
          </tr>
          <tr><td style="padding:6px 0;"><b>Fecha de pago:</b></td><td style="padding:6px 0;">${fechaPago ? fmtFecha(fechaPago) : '—'}</td></tr>
          ${idPago ? `<tr><td style="padding:6px 0;"><b>N.º Pago:</b></td><td style="padding:6px 0;">#${idPago}</td></tr>` : ''}
        </table>

        <!-- NOTA IMPORTANTE / CONDICIONES -->
        <div style="
          margin-top:24px;
          padding:10px 12px;
          background:#fef2f2;
          border:1px solid #fecaca;
          border-radius:8px;
          font-size:12px;
          line-height:1.45;
          color:#991b1b;
        ">
          <strong>Nota importante:</strong>
          El solicitante se compromete a utilizar el recurso estrictamente en la
          <strong>fecha y horario indicados en esta reserva</strong>.
          En caso de no utilizar el espacio o mueble sin previo aviso a la municipalidad,
          podrán aplicarse <strong>cargos administrativos, sanciones</strong> o restricciones
          para futuras reservas.
        </div>

        <!-- Firmas -->
        <div style="margin-top:34px;display:flex;justify-content:space-around;">
          <div style="text-align:center;">
            <div style="border-top:1px solid #cbd5e1;width:220px;margin:auto;margin-top:40px;"></div>
            <small>Firma del Solicitante</small>
          </div>
          <div style="text-align:center;">
            <div style="border-top:1px solid #cbd5e1;width:220px;margin:auto;margin-top:40px;"></div>
            <small>Aprobador</small>
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

  const cont = document.createElement('div');
  cont.innerHTML = html;
  document.body.appendChild(cont);

  await html2pdf()
    .set({
      margin: [10, 15, 10, 15], // top, right, bottom, left en mm
      filename: `Reserva-${idReserva}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#fff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(cont)
    .save();

  cont.remove();
}
