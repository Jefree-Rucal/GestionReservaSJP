// src/components/CrearEspacio.jsx
import React, { useEffect, useRef, useState } from 'react';
import '../styles/CrearEspacio.css';
import { postJSON } from '../utils/api';

const TIPOS_ESPACIO = [
  { value: 'Espacios Recreativos', slug: 'recreativos' },
  { value: 'Espacios Comunales', slug: 'comunales' },
  { value: 'Áreas Verdes', slug: 'areas-verdes' },
  { value: 'Espacios para Eventos', slug: 'eventos' },
  { value: 'Varios', slug: 'varios' },
];

function CrearEspacio() {
  const [formData, setFormData] = useState({
    nombre: '',
    tipo: '',
    ubicacion: '',
    estado_id: '1',
  });
  const [mensaje, setMensaje] = useState('');
  const [openTipo, setOpenTipo] = useState(false);

  // Cierra el menú si hago click fuera
  const tipoRef = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => {
      if (tipoRef.current && !tipoRef.current.contains(e.target)) setOpenTipo(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // ===== Handlers =====
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'nombre' || name === 'ubicacion') {
      // Letras (con acentos), números y signos comunes.
      const limpio = value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 .,#()/_-]/g, '');
      setFormData((p) => ({ ...p, [name]: limpio }));
      return;
    }
    setFormData((p) => ({ ...p, [name]: value }));
  };

  const selectTipo = (opt) => {
    setFormData((p) => ({ ...p, tipo: opt.value }));
    setOpenTipo(false);
  };

  const reset = () =>
    setFormData({ nombre: '', tipo: '', ubicacion: '', estado_id: '1' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje('');

    if (!formData.nombre.trim() || !formData.tipo || !formData.ubicacion.trim()) {
      setMensaje('❌ Todos los campos son obligatorios');
      return;
    }
    const valido = TIPOS_ESPACIO.some((t) => t.value === formData.tipo);
    if (!valido) {
      setMensaje('❌ Selecciona un tipo válido');
      return;
    }

    try {
      await postJSON('/api/catalogos/espacios', {
        nombre: formData.nombre.trim(),
        tipo: formData.tipo,
        ubicacion: formData.ubicacion.trim(),
        estado_id: parseInt(formData.estado_id, 10),
      });

      setMensaje('✅ Espacio público creado correctamente');
      reset();
    } catch (err) {
      console.error(err);
      setMensaje('❌ ' + (err?.message || 'Error de conexión con el servidor'));
    }
  };

  // Chip para mostrar selección
  const chipTipo = (() => {
    if (!formData.tipo) return <span className="ce-placeholder">— Selecciona tipo —</span>;
    const slug = TIPOS_ESPACIO.find((t) => t.value === formData.tipo)?.slug || 'default';
    return <span className={`ce-chip ce-chip--${slug}`}>{formData.tipo}</span>;
  })();

  return (
    <div className="crear-espacio-container">
      <h2>🏛️ Crear Nuevo Espacio Público</h2>

      {mensaje && (
        <div className={`mensaje ${mensaje.startsWith('✅') ? 'exito' : 'error'}`}>
          {mensaje}
        </div>
      )}

      <form onSubmit={handleSubmit} className="formulario-espacio">
        <div className="form-group">
          <label>Nombre del Espacio:</label>
          <input
            type="text"
            name="nombre"
            value={formData.nombre}
            onChange={handleChange}
            placeholder="Ej: Parque Central"
            required
            minLength={3}
            maxLength={100}
            title="Usa letras, números y signos comunes (.,-/#()_)."
          />
        </div>

        {/* Combo tipo bonito */}
        <div className="form-group" ref={tipoRef}>
          <label>Tipo:</label>
          <div
            className={`ce-select__control ${openTipo ? 'is-open' : ''}`}
            onClick={() => setOpenTipo((o) => !o)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpenTipo((o) => !o)}
          >
            <div className="ce-value">{chipTipo}</div>
            <div className={`ce-caret ${openTipo ? 'up' : ''}`} />
          </div>

          {openTipo && (
            <div className="ce-select__menu">
              {TIPOS_ESPACIO.map((opt) => (
                <div
                  key={opt.value}
                  className="ce-option"
                  onClick={() => selectTipo(opt)}
                  role="menuitem"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && selectTipo(opt)}
                >
                  <span className={`ce-dot ce-dot--${opt.slug}`} />
                  <span className="ce-option__label">{opt.value}</span>
                  {formData.tipo === opt.value && <span className="ce-check">✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Ubicación:</label>
          <input
            type="text"
            name="ubicacion"
            value={formData.ubicacion}
            onChange={handleChange}
            placeholder="Ej: Zona 1, frente al Palacio"
            required
            minLength={3}
            maxLength={120}
            title="Usa letras, números y signos comunes (.,-/#()_)."
          />
        </div>

        <div className="form-group">
          <label>Estado:</label>
          <select name="estado_id" value={formData.estado_id} onChange={handleChange}>
            <option value="1">Activo</option>
            <option value="2">Inactivo</option>
          </select>
        </div>

        <button type="submit" className="btn-crear">📝 Crear Espacio</button>
      </form>
    </div>
  );
}

export default CrearEspacio;
