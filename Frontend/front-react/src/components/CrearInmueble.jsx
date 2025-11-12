import React, { useState, useEffect, useRef } from 'react';
import '../styles/CrearInmueble.css';

const TIPOS_INVENTARIO = [
  { key: 'mobiliario',  label: 'Mobiliario'  },
  { key: 'electronica', label: 'Electrónica' },
  { key: 'herramienta', label: 'Herramienta' },
  { key: 'varios',  label: 'Varios'  },
];

function CrearInmueble() {
  const [formData, setFormData] = useState({
    nombre: '',
    tipo: '',          // guardamos el label (p.ej. "Mobiliario")
    tipoKey: '',       // y también la key para estilos (p.ej. "mobiliario")
    ubicacion: '',
    cantidad_total: '',
    estado_id: '1'
  });

  const [mensaje, setMensaje] = useState('');

  // ===== SELECT CUSTOM (Tipo) =====
  const [openTipo, setOpenTipo] = useState(false);
  const tipoRef = useRef(null);

  const toggleTipo = () => setOpenTipo(v => !v);
  const closeTipo  = () => setOpenTipo(false);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (tipoRef.current && !tipoRef.current.contains(e.target)) closeTipo();
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') closeTipo();
    };
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onEsc);
    };
  }, []);

  const selectTipo = (opt) => {
    setFormData(prev => ({ ...prev, tipo: opt.label, tipoKey: opt.key }));
    closeTipo();
  };

  // ===== Handlers =====
  const handleChange = (e) => {
    const { name, value } = e.target;

    // Validaciones suaves por campo (evita caracteres raros)
    if (name === 'nombre') {
      const limpio = value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 .,#()/_-]/g, '');
      setFormData(prev => ({ ...prev, [name]: limpio }));
      return;
    }
    if (name === 'ubicacion') {
      const limpio = value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 .,#()/_-]/g, '');
      setFormData(prev => ({ ...prev, [name]: limpio }));
      return;
    }
    if (name === 'cantidad_total') {
      if (value === '' || (/^\d+$/.test(value) && parseInt(value, 10) >= 0)) {
        setFormData(prev => ({ ...prev, [name]: value }));
      }
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje('');

    // Validaciones front
    if (!formData.nombre || !formData.tipo || !formData.ubicacion || !formData.cantidad_total) {
      setMensaje('❌ Todos los campos son obligatorios');
      return;
    }

    if (!TIPOS_INVENTARIO.some(t => t.label === formData.tipo)) {
      setMensaje('❌ Selecciona un tipo válido');
      return;
    }

    if (isNaN(formData.cantidad_total) || parseInt(formData.cantidad_total, 10) <= 0) {
      setMensaje('❌ La cantidad debe ser un número mayor a 0');
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/api/catalogos/inmuebles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre.trim(),
          tipo: formData.tipo, // label legible
          ubicacion: formData.ubicacion.trim(),
          cantidad_total: parseInt(formData.cantidad_total, 10),
          estado_id: parseInt(formData.estado_id, 10)
        })
      });

      const ct = response.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await response.json() : { error: await response.text() };

      if (response.ok) {
        setMensaje('✅ Mueble creado correctamente');
        setFormData({
          nombre: '',
          tipo: '',
          tipoKey: '',
          ubicacion: '',
          cantidad_total: '',
          estado_id: '1'
        });
      } else {
        setMensaje(`❌ Error: ${data?.error || 'No se pudo crear el Mueble'}`);
      }
    } catch (error) {
      console.error('Error:', error);
      setMensaje('❌ Error de conexión con el servidor');
    }
  };

  return (
    <div className="crear-inmueble-container">
      <h2>🛋️ Crear Nuevo Mueble</h2>

      {mensaje && (
        <div className={`mensaje ${mensaje.startsWith('✅') ? 'exito' : 'error'}`}>
          {mensaje}
        </div>
      )}

      <form onSubmit={handleSubmit} className="formulario-inmueble">
        <div className="form-group">
          <label>Nombre del Mueble:</label>
          <input
            type="text"
            name="nombre"
            value={formData.nombre}
            onChange={handleChange}
            placeholder="Ej: Sillas Ejecutivas"
            required
            minLength={3}
            maxLength={80}
            title="Usa letras, números y signos comunes (.,-/#()_)."
          />
        </div>

        {/* ===== Select bonito de Tipo ===== */}
        <div className="form-group" ref={tipoRef}>
          <label>Tipo:</label>

          <div
            className={`ci-select__control ${openTipo ? 'is-open' : ''}`}
            tabIndex={0}
            onClick={toggleTipo}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleTipo(); }}
            role="button"
            aria-haspopup="listbox"
            aria-expanded={openTipo}
          >
            {formData.tipo ? (
              <span className={`ci-chip ci-chip--${formData.tipoKey || 'default'}`}>
                {formData.tipo}
              </span>
            ) : (
              <span className="ci-placeholder">-- Selecciona tipo --</span>
            )}
            <span className={`ci-caret ${openTipo ? 'up' : 'down'}`}/>
          </div>

          {openTipo && (
            <div className="ci-select__menu" role="listbox">
              {TIPOS_INVENTARIO.map(opt => (
                <div
                  key={opt.key}
                  className="ci-option"
                  role="option"
                  aria-selected={formData.tipoKey === opt.key}
                  onClick={() => selectTipo(opt)}
                >
                  <span className={`ci-dot ci-dot--${opt.key}`} />
                  <span className="ci-option__label">{opt.label}</span>
                  {formData.tipoKey === opt.key && <span className="ci-check">✓</span>}
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
            placeholder="Ej: Auditorio Principal"
            required
            minLength={3}
            maxLength={100}
            title="Usa letras, números y signos comunes (.,-/#()_)."
          />
        </div>

        <div className="form-group">
          <label>Cantidad Total:</label>
          <input
            type="number"
            name="cantidad_total"
            value={formData.cantidad_total}
            onChange={handleChange}
            placeholder="Ej: 50"
            min="1"
            step="1"
            required
          />
        </div>

        <div className="form-group">
          <label>Estado:</label>
          <select name="estado_id" value={formData.estado_id} onChange={handleChange}>
            <option value="1">Activo</option>
            <option value="2">Inactivo</option>
          </select>
        </div>

        <button type="submit" className="btn-crear">
          📝 Crear Mueble
        </button>
      </form>
    </div>
  );
}

export default CrearInmueble;