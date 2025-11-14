// src/components/CrearReserva.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import '../styles/CrearReserva.css';
import { generarReservaPDF } from '../utils/generarReservaPDF';
import { getJSON, postJSON } from '../utils/api';

// Regex de validación
const RE_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{3,80}$/;
const RE_TEL    = /^\d{8,12}$/;
const RE_DPI    = /^\d{6,20}$/;
const isEmail   = (e) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(e);

// Formatea a "YYYY-MM-DDTHH:MM" en HORA LOCAL (para inputs datetime-local)
const toLocalInputValue = (d = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ===== Conversores auxiliares =====
const toISO      = (localDT) => (!localDT ? '' : (isNaN(new Date(localDT)) ? '' : new Date(localDT).toISOString()));
const getDateStr = (iso) => (iso || '').split('T')[0] || '';

// Convierte "YYYY-MM-DDTHH:MM" -> "YYYY-MM-DD HH:MM:00" (local, sin Z)
function toLocalSQL(localDT) {
  if (!localDT) return '';
  const [d, t] = String(localDT).split('T');
  return `${d} ${t}:00`;
}

// Helper para leer estado del espacio (activo / inactivo)
const getEstadoEspacio = (raw) =>
  Number(
    raw?.estado_id ??
    raw?.e_estado_id_estadoe ??
    raw?.e_estado_id_estador ??
    1
  );

// ====== Config de estados de reserva ======
const EXCLUIR_ESTADOS_IDS = new Set([6, 8]);
const nombreEsNoVigente = (txt) => /cancelad|rechazad/i.test(String(txt || ''));
const esConflictoVigente = (c) => {
  const candidates = [
    Number(c?.estado_id),
    Number(c?.estado),
    Number(c?.estado_reserva_id),
  ].filter((x) => Number.isFinite(x));
  for (const id of candidates) {
    if (EXCLUIR_ESTADOS_IDS.has(id)) return false;
  }
  const name = c?.estado_nombre ?? c?.estado_texto ?? c?.estado_descripcion ?? '';
  if (nombreEsNoVigente(name)) return false;
  return true;
};

function CrearReserva() {
  const [formData, setFormData] = useState({
    nombre: '', dpi: '', telefono: '', correo: '',
    hora_inicio: '', hora_final: '', motivo: '',
    espacio_id: '', inmueble_id: '', cantidad: ''
  });

  const [espacios, setEspacios] = useState([]);
  const [inmuebles, setInmuebles] = useState([]);

  // Disponibilidad / conflictos
  const [maxCantidad, setMaxCantidad] = useState(1);
  const [disponibilidad, setDisponibilidad] = useState({ cantidad_disponible: undefined });
  const [conflictosEspacio, setConflictosEspacio] = useState([]);

  // Tarifas
  const [tarifas, setTarifas] = useState([]);
  
  // === Autocompletar solicitante ===
  const [sugs, setSugs] = useState([]);
  const [qNombre, setQNombre] = useState('');
  const [loadingSugs, setLoadingSugs] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);

  // Pago/UI
  const [aceptaPago, setAceptaPago] = useState(false);
  const [showTarifaModal, setShowTarifaModal] = useState(false);

  // Toast
  const [banner, setBanner] = useState({ type: null, text: '' });
  const bannerTimeoutRef = useRef(null);
  const showBanner = useCallback((type, text, ms = 4000) => {
    if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    setBanner({ type, text });
    bannerTimeoutRef.current = setTimeout(() => setBanner({ type: null, text: '' }), ms);
  }, []);
  useEffect(() => () => bannerTimeoutRef.current && clearTimeout(bannerTimeoutRef.current), []);

  // Destructuring cómodo
  const { nombre, dpi, telefono, correo, hora_inicio, hora_final, motivo, espacio_id, inmueble_id, cantidad } = formData;

  const isoInicio = useMemo(() => toISO(hora_inicio), [hora_inicio]);
  const isoFin    = useMemo(() => toISO(hora_final),  [hora_final]);

  const rangoValido = useMemo(() => {
    if (!isoInicio || !isoFin) return false;
    const s = new Date(isoInicio), e = new Date(isoFin);
    return !isNaN(s) && !isNaN(e) && e > s;
  }, [isoInicio, isoFin]);

  // ======= Bloquear pasado en los inputs (min) =======
  const minAhora = useMemo(() => toLocalInputValue(new Date()), []);
  const minInicio = minAhora;
  const minFin = useMemo(() => {
    const hi = formData.hora_inicio;
    return hi && hi > minAhora ? hi : minAhora;
  }, [formData.hora_inicio, minAhora]);

  // Cargar catálogos (1 sola vez)
  useEffect(() => {
    (async () => {
      try {
        const [esp, inm, tarMaybe] = await Promise.all([
          getJSON('/api/catalogos/espacios'),
          getJSON('/api/catalogos/inmuebles'),
          getJSON('/api/tarifas/listado').catch(() => [])
        ]);

        // 🔹 SOLO ESPACIOS ACTIVOS (estado_id = 1)
        const espaciosActivos = Array.isArray(esp)
          ? esp.filter((e) => getEstadoEspacio(e) === 1)
          : [];
        setEspacios(espaciosActivos);

        // 🔹 Solo INMUEBLES activos (estado 1). 7 = inactivo se excluye.
        const inmueblesActivos = Array.isArray(inm)
          ? inm.filter((i) => {
              const est = Number(
                i.estado_id ??
                i.id_estado ??
                i.i_estado_id_estadoi ??
                i.i_estado_id_estador
              );
              return !est || est === 1;
            })
          : [];
        setInmuebles(inmueblesActivos);

        setTarifas(Array.isArray(tarMaybe) ? tarMaybe : []);
      } catch {
        showBanner('error', 'Error cargando catálogos');
      }
    })();
  }, [showBanner]);

  // Disponibilidad Inmuebles
  useEffect(() => {
    setDisponibilidad({ cantidad_disponible: undefined });
    setMaxCantidad(1);
    if (!inmueble_id) return;

    (async () => {
      try {
        const data = await getJSON(`/api/catalogos/inmuebles/stock/${inmueble_id}`);
        const disponible = Number(data?.cantidad_disponible ?? 0);
        setDisponibilidad({ cantidad_disponible: disponible });
        setMaxCantidad(disponible);

        // Ajusta cantidad si quedó por encima
        setFormData(prev => {
          if (!prev.cantidad) return prev;
          const n = Number(prev.cantidad);
          if (!Number.isFinite(n) || n < 1) return { ...prev, cantidad: '' };
          if (n > disponible) return { ...prev, cantidad: String(disponible) };
          return prev;
        });
      } catch (err) {
        showBanner('error', 'Error al obtener stock del inmueble');
        setMaxCantidad(0);
        setDisponibilidad({ cantidad_disponible: 0 });
      }
    })();
  }, [inmueble_id, showBanner]);

  // Solapamientos ESPACIOS: ignora canceladas/rechazadas
  useEffect(() => {
    setConflictosEspacio([]);
    if (!espacio_id || !rangoValido) return;

    (async () => {
      try {
        const data = await getJSON(
          `/api/reservas/espacios/ocupado/${espacio_id}?inicio=${encodeURIComponent(isoInicio)}&fin=${encodeURIComponent(isoFin)}&soloVigentes=1`
        );
        const crudos = Array.isArray(data?.conflictos) ? data.conflictos : [];
        const vigentes = crudos.filter(esConflictoVigente);
        setConflictosEspacio(vigentes);
      } catch (err) {
        // Si el endpoint responde 404, lo tratamos como "sin conflictos"
        if (String(err?.message || '').startsWith('HTTP 404')) {
          setConflictosEspacio([]);
        } else {
          showBanner('error', 'Error de conexión al verificar ocupación del espacio');
        }
      }
    })();
  }, [espacio_id, rangoValido, isoInicio, isoFin, showBanner]);

  // Handlers
  const clampToMax = useCallback((raw) => {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits || /^0+$/.test(digits)) return '';
    const n = Math.max(1, Number(digits));
    const top = Number.isFinite(Number(maxCantidad)) ? Number(maxCantidad) : n;
    return String(Math.min(n, top));
  }, [maxCantidad]);

  const handleCantidadInput = (e) => setFormData(prev => ({ ...prev, cantidad: clampToMax(e.target.value) }));

  const handleChange = (e) => {
    const { name, value } = e.target;

    // BLOQUEA pasado y mantiene coherencia entre inicio/fin
    if (name === 'hora_inicio') {
      const v = value && value < minInicio ? minInicio : value;
      setFormData(p => ({
        ...p,
        hora_inicio: v,
        hora_final: p.hora_final && p.hora_final < (v || minFin) ? (v || minFin) : p.hora_final,
      }));
      return;
    }
    if (name === 'hora_final') {
      const minLocal = formData.hora_inicio && formData.hora_inicio > minInicio ? formData.hora_inicio : minInicio;
      const v = value && value < minLocal ? minLocal : value;
      setFormData(p => ({ ...p, hora_final: v }));
      return;
    }

    if (name === 'nombre') {
      const limpio = value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]/g, '');
      setQNombre(limpio);
      if (limpio.trim() === '') {
        setFormData(p => ({ ...p, nombre: '', dpi: '', telefono: '', correo: '' }));
        return;
      }
      return setFormData(p => ({ ...p, nombre: limpio }));
    }
    if (name === 'telefono') return setFormData(p => ({ ...p, telefono: value.replace(/\D/g, '').slice(0, 12) }));
    if (name === 'dpi')      return setFormData(p => ({ ...p, dpi: value.replace(/\D/g, '').slice(0, 20) }));
    if (name === 'motivo')   return setFormData(p => ({ ...p, motivo: value.replace(/[<>]/g, '').slice(0, 200) }));
    if (name === 'correo')   return setFormData(p => ({ ...p, correo: value.slice(0, 120) }));
    if (name === 'cantidad') return setFormData(p => ({ ...p, cantidad: clampToMax(value) }));

    if (name === 'inmueble_id') {
      setAceptaPago(false);
      return setFormData(p => ({ ...p, inmueble_id: value, espacio_id: value ? '' : p.espacio_id, cantidad: '' }));
    }
    if (name === 'espacio_id') {
      setAceptaPago(false);
      return setFormData(p => ({ ...p, espacio_id: value, inmueble_id: value ? '' : p.inmueble_id, cantidad: '' }));
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCantidadBlur = () => {
    setFormData(prev => {
      const raw = prev.cantidad;
      if (raw === '') return prev;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1) return { ...prev, cantidad: '1' };
      if (typeof maxCantidad === 'number' && n > Number(maxCantidad)) return { ...prev, cantidad: String(maxCantidad) };
      return prev;
    });
  };

  // === Disparar lookup con ENTER o TAB en el campo "nombre" ===
  const buscarPorNombre = useCallback(async (nombreStr) => {
    const nombreLimpio = (nombreStr || '').trim();
    if (nombreLimpio.length < 3) return;

    try {
      setLookupBusy(true);
      const data = await getJSON(`/api/solicitante/lookup?nombre=${encodeURIComponent(nombreLimpio)}`).catch((err) => {
        if (String(err?.message || '').startsWith('HTTP 404')) return null;
        throw err;
      });
      if (!data) return;

      setFormData(prev => ({
        ...prev,
        dpi:      data?.dpi      || '',
        telefono: data?.telefono || '',
        correo:   data?.correo   || ''
      }));
    } catch {
      showBanner('error', 'No se pudo consultar el solicitante');
    } finally {
      setLookupBusy(false);
    }
  }, [showBanner]);

  const handleNombreKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      buscarPorNombre(e.currentTarget.value);
    }
    if (e.key === 'Tab') {
      buscarPorNombre(e.currentTarget.value);
    }
  };

  const resetFormulario = () => {
    setFormData({
      nombre: '', dpi: '', telefono: '', correo: '',
      hora_inicio: '', hora_final: '', motivo: '',
      espacio_id: '', inmueble_id: '', cantidad: ''
    });
    setDisponibilidad({ cantidad_disponible: undefined });
    setMaxCantidad(1);
    setConflictosEspacio([]);
    setAceptaPago(false);
  };

  // Preflight con el mismo filtro de conflictos (ignora canceladas/rechazadas)
  const preflightOverlap = useCallback(async () => {
    if (espacio_id) {
      try {
        const d = await getJSON(
          `/api/reservas/espacios/ocupado/${espacio_id}?inicio=${encodeURIComponent(isoInicio)}&fin=${encodeURIComponent(isoFin)}&soloVigentes=1`
        );
        const crudos = Array.isArray(d?.conflictos) ? d.conflictos : [];
        const vigentes = crudos.filter(esConflictoVigente);
        if (vigentes.length > 0) return { ok: false, msg: 'El espacio ya está reservado en el rango seleccionado.' };
      } catch (err) {
        if (!String(err?.message || '').startsWith('HTTP 404')) {
          throw err;
        }
      }
    }
    if (inmueble_id) {
      if (!cantidad || Number(cantidad) < 1) return { ok: false, msg: 'Debes ingresar una cantidad válida (≥ 1).' };
      if (Number(cantidad) > Number(maxCantidad)) return { ok: false, msg: `La cantidad solicitada supera la disponibilidad (${maxCantidad}).` };
    }
    return { ok: true };
  }, [espacio_id, inmueble_id, isoInicio, isoFin, cantidad, maxCantidad]);

  // === Tarifa aplicable y monto (derivados, no estado) ===
  const tarifaAplicable = useMemo(() => {
    if (!inmueble_id && !espacio_id) return null;
    const activas = tarifas.filter(t => Number(t.t_estado_id_estado) === 1);
    if (inmueble_id) {
      const id = Number(inmueble_id);
      return activas.find(x => Number(x.inmueble_id_inmueble) === id) || null;
    }
    if (espacio_id) {
      const id = Number(espacio_id);
      return activas.find(x => Number(x.espacios_publicos_id_espacio) === id) || null;
    }
    return null;
  }, [tarifas, inmueble_id, espacio_id]);

  const montoEstimado = useMemo(() => Number(tarifaAplicable?.t_monto || 0), [tarifaAplicable]);

  // Si no hay tarifa, permite enviar sin “aceptar pago”
  useEffect(() => {
    if (!inmueble_id && !espacio_id) { setAceptaPago(false); return; }
    if (!tarifaAplicable) setAceptaPago(true);
  }, [inmueble_id, espacio_id, tarifaAplicable]);

  // Sugerencias mientras escribe (debounce 250ms)
  useEffect(() => {
    const q = (qNombre || '').trim();
    if (q.length < 2) { setSugs([]); return; }

    setLoadingSugs(true);
    const t = setTimeout(async () => {
      try {
        const data = await getJSON(`/api/solicitante/sugerencias?q=${encodeURIComponent(q)}`).catch(() => []);
        setSugs(Array.isArray(data) ? data : []);
      } catch {
        // silencio
      } finally {
        setLoadingSugs(false);
      }
    }, 250);

    return () => { clearTimeout(t); };
  }, [qNombre]);

  // Nombres auxiliares
  const findInmuebleNombre = useCallback(
    (id) => inmuebles.find(i => Number(i.id) === Number(id))?.nombre || '',
    [inmuebles]
  );
  const findEspacioNombre = useCallback(
    (id) => espacios.find(e => Number(e.id) === Number(id))?.nombre || '',
    [espacios]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.hora_inicio && formData.hora_inicio < minInicio) {
      return showBanner('error', 'La fecha de inicio no puede estar en el pasado.');
    }

    if (!RE_NOMBRE.test(nombre.trim()))     return showBanner('error', 'Nombre inválido. Solo letras y espacios (3–80).');
    if (!RE_TEL.test(telefono))             return showBanner('error', 'Teléfono inválido. Solo dígitos (8–12).');
    if (!RE_DPI.test(dpi))                  return showBanner('error', 'DPI inválido. Solo dígitos (6–20).');
    if (!isEmail(correo))                   return showBanner('error', 'Correo electrónico inválido.');
    if (!espacio_id && !inmueble_id)        return showBanner('error', 'Debes seleccionar un espacio público o un mueble.');
    if (!rangoValido)                       return showBanner('error', 'Selecciona un inicio y fin válidos.');
    if (tarifaAplicable && !aceptaPago)     return showBanner('error', 'Debes aceptar el aviso de pago para continuar.');

    try {
      const pre = await preflightOverlap();
      if (!pre.ok) return showBanner('error', pre.msg || 'Rango no disponible.');
    } catch (err) {
      return showBanner('error', err.message || 'No se pudo validar la disponibilidad.');
    }

    const payload = {
      solicitante: {
        nombre: nombre.trim(),
        dpi: dpi.trim(),
        telefono: telefono.trim(),
        correo: correo.trim()
      },
      reserva: {
        fecha: (formData.hora_inicio || '').split('T')[0],
        hora_inicio: toLocalSQL(formData.hora_inicio),
        hora_final:  toLocalSQL(formData.hora_final),
        motivo: motivo.trim(),
        // El backend obtiene usuario_id del token (el helper añade Authorization si existe)
        espacio_id:  espacio_id  ? parseInt(espacio_id, 10)  : null,
        inmueble_id: inmueble_id ? parseInt(inmueble_id, 10) : null,
        cantidad:    inmueble_id ? parseInt(cantidad || '0', 10) : 1,
        estado_id: 2
      }
    };

    try {
      const data = await postJSON('/api/reservas/crear', payload);
      showBanner('success', 'Reserva creada correctamente');

      const idReserva =
        Number(data?.id_reserva) ||
        Number(data?.reserva?.id_reserva) ||
        Number(data?.reserva_id_reserva);

      await generarReservaPDF({
        idReserva,
        recursoNombre: espacio_id ? findEspacioNombre(espacio_id) : findInmuebleNombre(inmueble_id),
        tipoRecurso: espacio_id ? 'Espacio público' : 'Mueble',
        fechaSolicitud: isoInicio,
        fechaInicio: isoInicio,
        fechaFinal: isoFin,
        motivo,
        solicitante: { nombre, dpi, telefono, correo },
        monto: montoEstimado,
        fechaPago: new Date().toISOString()
      });

      resetFormulario();
      // refresco rápido de inmuebles
      getJSON('/api/catalogos/inmuebles').then(setInmuebles).catch(()=>{});
    } catch (err) {
      console.error('Error al conectar:', err);
      showBanner('error', 'No se pudo conectar con el servidor');
    }
  };

  const soloEspacio = !!espacio_id && !inmueble_id;
  const soloInmueble = !!inmueble_id && !espacio_id;
  const setMode = (mode) => {
    if (mode === 'espacio') setFormData(p => ({ ...p, espacio_id: p.espacio_id || '', inmueble_id: '', cantidad: '' }));
    else if (mode === 'mueble') setFormData(p => ({ ...p, inmueble_id: p.inmueble_id || '', espacio_id: '', cantidad: '' }));
    else setFormData(p => ({ ...p, espacio_id: '', inmueble_id: '', cantidad: '' }));
    setAceptaPago(false);
  };

  const botonDeshabilitado =
    (soloInmueble && (maxCantidad <= 0 || !cantidad || Number(cantidad) < 1)) ||
    (soloEspacio && conflictosEspacio.length > 0) ||
    !rangoValido ||
    (!!tarifaAplicable && !aceptaPago);

  // ======================= Render =======================
  return (
    <div className="crear-reserva-page">
      {banner.type && (
        <div className={`cr-alert ${banner.type === 'success' ? 'cr-alert--success' : 'cr-alert--error'}`} role="status" aria-live="polite">
          {banner.text}
          <button className="cr-alert__close" onClick={() => setBanner({ type: null, text: '' })} type="button" aria-label="Cerrar notificación">×</button>
        </div>
      )}

      <header className="cr-header">
        <div><h1>Crear Reserva</h1></div>
        <div className="cr-steps" aria-hidden>
          <span className={nombre ? 'ok' : ''} />
          <span className={rangoValido ? 'ok' : ''} />
          <span className={(espacio_id || inmueble_id) ? 'ok' : ''} />
          <span className={(!!tarifaAplicable ? aceptaPago : true) && (espacio_id || inmueble_id) && rangoValido ? 'ok' : ''} />
        </div>
      </header>

      <div className="cr-grid">
        {/* Formulario */}
        <form onSubmit={handleSubmit} className="crear-reserva cr-form" noValidate>
          {/* Solicitante */}
          <section className="cr-card">
            <div className="cr-card__title"><span className="cr-chip">1</span><h2>Datos del solicitante</h2></div>
            <div className="cr-fields cr-fields--2col">
              <label>Nombre completo
                <input
                  name="nombre"
                  list="sugs-nombres"
                  placeholder="Ej. María Pérez"
                  onChange={handleChange}
                  onKeyDown={handleNombreKeyDown}
                  value={formData.nombre}
                  required
                  inputMode="text"
                  autoComplete="name"
                  aria-invalid={!!formData.nombre && !RE_NOMBRE.test(formData.nombre)}
                />
                <datalist id="sugs-nombres">
                  {sugs.map(s => (
                    <option key={s.id || s.ID || s.id_solitante} value={s.nombre || s.s_nombrec} />
                  ))}
                </datalist>
              </label>

              <label>DPI
                <input name="dpi" placeholder="Solo dígitos" onChange={handleChange} value={dpi} required inputMode="numeric" pattern="\d*" aria-invalid={!!dpi && !RE_DPI.test(dpi)} />
              </label>
              <label>Teléfono
                <input name="telefono" placeholder="8 a 12 dígitos" onChange={handleChange} value={telefono} required inputMode="tel" pattern="\d*" aria-invalid={!!telefono && !RE_TEL.test(telefono)} />
              </label>
              <label>Correo electrónico
                <input name="correo" placeholder="correo@dominio.com" onChange={handleChange} value={correo} inputMode="email" aria-invalid={!!correo && !isEmail(correo)} />
              </label>
              <label className="cr-field--full">Motivo del uso
                <input name="motivo" placeholder="Describe brevemente el propósito de la reserva" onChange={handleChange} value={motivo} required />
              </label>
            </div>
          </section>

          {/* Fecha y hora */}
          <section className="cr-card">
            <div className="cr-card__title"><span className="cr-chip">2</span><h2>Fecha y hora</h2></div>
            <div className="cr-fields cr-fields--2col">
              <label>Inicio
                <input
                  name="hora_inicio"
                  type="datetime-local"
                  min={minInicio}
                  onChange={handleChange}
                  value={formData.hora_inicio}
                  required
                />
              </label>
              <label>Fin
                <input
                  name="hora_final"
                  type="datetime-local"
                  min={minFin}
                  onChange={handleChange}
                  value={formData.hora_final}
                  required
                />
              </label>
            </div>
            {!rangoValido && <div className="cr-hint">Selecciona un rango válido para continuar (el fin debe ser mayor al inicio).</div>}
          </section>

          {/* Recurso */}
          <section className="cr-card">
            <div className="cr-card__title"><span className="cr-chip">3</span><h2>Selecciona el recurso</h2></div>

            <div className="pill-toggle" role="tablist" aria-label="Tipo de recurso">
              <button type="button" role="tab" aria-selected={(!!espacio_id && !inmueble_id)} className={`pill ${ (!!espacio_id && !inmueble_id) ? 'active' : '' }`} onClick={() => setMode('espacio')}>🏛️ Espacio público</button>
              <button type="button" role="tab" aria-selected={(!!inmueble_id && !espacio_id)} className={`pill ${ (!!inmueble_id && !espacio_id) ? 'active' : '' }`} onClick={() => setMode('mueble')}>🪑 Mueble</button>
              <button type="button" role="tab" aria-selected={(!espacio_id && !inmueble_id)} className={`pill ${ (!espacio_id && !inmueble_id) ? 'active' : '' }`} onClick={() => setMode('ninguno')}>Ver ambos</button>
            </div>

            <div className="cr-fields cr-fields--2col">
              {/* Espacio */}
              {(!inmueble_id) && (
                <label className={inmueble_id ? 'is-disabled' : ''}>
                  Espacio público
                  <select name="espacio_id" value={espacio_id} onChange={handleChange} disabled={!!inmueble_id}>
                    <option value="">-- Ninguno --</option>
                    {espacios.map(esp => (<option key={esp.id} value={esp.id}>{esp.nombre}</option>))}
                  </select>

                  {!!espacio_id && (
                    <>
                      {rangoValido ? (
                        conflictosEspacio.length > 0
                          ? <div className="cr-danger" style={{marginTop:8}}>⚠️ El espacio está ocupado en el rango seleccionado.</div>
                          : <div className="cr-note" style={{marginTop:8}}>✅ Sin conflictos vigentes en este rango</div>
                      ) : <div className="cr-hint" style={{marginTop:8}}>El sistema verifica ocupación cuando el rango es válido.</div>}

                      {tarifaAplicable ? (
                        <>
                          <div className="cr-note mt8">
                            💳 Tarifa fija por uso: <strong>Q{montoEstimado.toFixed(2)}</strong>{' '}
                            <button type="button" className="cr-link" onClick={() => setShowTarifaModal(true)}>Ver detalle</button>
                          </div>
                          <label className="cr-check mt8">
                            <input type="checkbox" checked={aceptaPago} onChange={e=>setAceptaPago(e.target.checked)} />
                            <span>Entiendo que esta reserva requiere pago.</span>
                          </label>
                        </>
                      ) : <div className="cr-hint mt8">No hay tarifa configurada para este espacio.</div>}
                    </>
                  )}
                </label>
              )}

              {/* Mueble */}
              {(!espacio_id) && (
                <label className={espacio_id ? 'is-disabled' : ''}>
                  Mueble
                  <select name="inmueble_id" value={inmueble_id} onChange={handleChange} disabled={!!espacio_id}>
                    <option value="">-- Ninguno --</option>
                    {inmuebles.map(inm => (<option key={inm.id} value={inm.id}>{inm.nombre}</option>))}
                  </select>

                  {!!inmueble_id && (
                    <>
                      {typeof disponibilidad.cantidad_disponible === 'undefined'
                        ? <div className="cr-skeleton mt8" style={{height:38}} />
                        : maxCantidad === 0
                          ? <div className="cr-danger mt8">❌ Sin stock disponible.</div>
                          : <>
                              <div className="cr-note mt8">✅ Disponible <strong>{maxCantidad}</strong></div>
                              <label className="mt8">Cantidad a reservar
                                <input
                                  name="cantidad" type="number" min="1" max={maxCantidad}
                                  value={cantidad} onChange={handleChange}
                                  onInput={handleCantidadInput} onBlur={handleCantidadBlur}
                                  disabled={maxCantidad === 0} placeholder="Ingrese cantidad" inputMode="numeric"
                                />
                              </label>

                              {tarifaAplicable
                                ? <>
                                    <div className="cr-note mt8">
                                      💳 Tarifa fija por uso: <strong>Q{montoEstimado.toFixed(2)}</strong>
                                      <button type="button" className="cr-link" onClick={() => setShowTarifaModal(true)}> Ver detalle</button>
                                    </div>
                                    <label className="cr-check mt8">
                                      <input type="checkbox" checked={aceptaPago} onChange={e=>setAceptaPago(e.target.checked)} />
                                      <span>Entiendo que esta reserva requiere pago.</span>
                                    </label>
                                  </>
                                : <div className="cr-hint mt8">No hay tarifa configurada para este mueble.</div>}
                            </>
                      }
                    </>
                  )}
                </label>
              )}
            </div>
          </section>

          {/* Acciones */}
          <div className="cr-actions">
            <button type="button" className="btn-secondary" onClick={resetFormulario}>Limpiar</button>
            <button type="submit" disabled={botonDeshabilitado}>Reservar</button>
          </div>
        </form>

        {/* Resumen */}
        <aside className="cr-summary">
          <div className="cr-card">
            <div className="cr-card__title"><h3 className="m0">Resumen</h3></div>
            <div className="cr-summary__row"><span className="label">Solicitante</span><span className="value">{nombre || <span className="muted">—</span>}</span></div>
            <div className="cr-summary__row"><span className="label">Fecha</span><span className="value">{isoInicio ? getDateStr(isoInicio) : <span className="muted">—</span>}</span></div>
            <div className="cr-summary__row">
              <span className="label">Horario</span>
              <span className="value">
                {rangoValido ? `${new Date(isoInicio).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} — ${new Date(isoFin).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` : <span className="muted">—</span>}
              </span>
            </div>
            <div className="cr-summary__row">
              <span className="label">Recurso</span>
              <span className="value">
                {espacio_id ? `Espacio: ${findEspacioNombre(espacio_id)}` :
                 inmueble_id ? `Mueble: ${findInmuebleNombre(inmueble_id)}` :
                 <span className="muted">—</span>}
              </span>
            </div>
            {!!inmueble_id && (
              <div className="cr-summary__row">
                <span className="label">Cantidad</span>
                <span className="value">{cantidad || <span className="muted">—</span>}</span>
              </div>
            )}
            <hr className="cr-divider" />
            <div className="cr-summary__row total"><span className="label">Total estimado</span><span className="value strong">Q{montoEstimado.toFixed(2)}</span></div>
            {tarifaAplicable
              ? <div className={`badge ${aceptaPago ? 'ok' : ''}`}>{aceptaPago ? 'Pago aceptado' : 'Pago pendiente de aceptación'}</div>
              : <div className="badge neutral">Sin tarifa configurada</div>}
          </div>
        </aside>
      </div>

      {/* Modal tarifa */}
      {showTarifaModal && tarifaAplicable && (
        <div className="cr-modal" onClick={() => setShowTarifaModal(false)}>
          <div className="cr-modal__dialog" onClick={(e)=>e.stopPropagation()}>
            <div className="cr-modal__header">
              <h3 className="m0">Detalle de pago</h3>
              <button onClick={()=>setShowTarifaModal(false)} className="cr-link">✕</button>
            </div>
            <div className="cr-modal__body">
              <p className="m6"><strong>Tarifa:</strong> {tarifaAplicable.t_nombre}</p>
              <p className="m6"><strong>Recurso:</strong> {inmueble_id ? findInmuebleNombre(inmueble_id) : findEspacioNombre(espacio_id)}</p>
              <p className="m6"><strong>Tipo:</strong> Tarifa fija por uso</p>
              {!!inmueble_id && <p className="m6"><strong>Cantidad solicitada:</strong> {cantidad || '—'}</p>}
              <p className="m10 fs16"><strong>Total estimado:</strong> <span>Q{montoEstimado.toFixed(2)}</span></p>
              <small className="cr-hint">* El monto es informativo. El pago se gestiona en el módulo de Pagos.</small>
            </div>
            <div className="cr-modal__footer">
              <button className="btn-secondary" onClick={()=>setShowTarifaModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CrearReserva;
