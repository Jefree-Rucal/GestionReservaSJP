// src/components/ConfigurarTarifas.jsx
import React, { useState, useEffect } from 'react';
import '../styles/ConfigurarTarifas.css';
import { getJSON, postJSON, putJSON, deleteJSON } from '../utils/api';

//
// Helpers para tolerar distintos shapes de catálogos (id/nombre vs id_inmueble/i_nombre, etc.)
//
const getIdFrom = (obj, tipo) =>
  tipo === 'inmueble' ? (obj.id_inmueble ?? obj.id) : (obj.id_espacio ?? obj.id);

const getNombreFrom = (obj, tipo) =>
  tipo === 'inmueble' ? (obj.i_nombre ?? obj.nombre) : (obj.e_nombre ?? obj.nombre);

function ConfigurarTarifas() {
  const [tarifas, setTarifas] = useState([]);
  const [inmuebles, setInmuebles] = useState([]);
  const [espacios, setEspacios] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTarifa, setEditingTarifa] = useState(null);

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    monto: '',
    tipo_recurso: '', // 'inmueble' o 'espacio'
    recurso_id: '',
    estado_id: '1',   // 1 = Activo
  });

  // Cargar datos iniciales
  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const [inmueblesData, espaciosData, tarifasData] = await Promise.all([
        getJSON('/api/catalogos/inmuebles'),
        getJSON('/api/catalogos/espacios'),
        getJSON('/api/tarifas'),
      ]);

      setInmuebles(Array.isArray(inmueblesData) ? inmueblesData : []);
      setEspacios(Array.isArray(espaciosData) ? espaciosData : []);
      setTarifas(Array.isArray(tarifasData) ? tarifasData : []);
      setMensaje('');
    } catch (error) {
      console.error('Error al cargar datos:', error);
      setMensaje('❌ ' + (error?.message || 'No se pudo cargar'));
      setTarifas([]);
    } finally {
      setLoading(false);
    }
  };

  // Si el backend ya trae el nombre normalizado, úsalo; si no, busca en catálogos
  const getNombreRecurso = (tipo, id, fallbackDelListado) => {
    if (fallbackDelListado) return fallbackDelListado;
    const lista = tipo === 'inmueble' ? inmuebles : espacios;
    const found = lista.find((x) => String(getIdFrom(x, tipo)) === String(id));
    if (found) return getNombreFrom(found, tipo);
    return tipo === 'inmueble' ? 'Inmueble no encontrado' : 'Espacio no encontrado';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'monto') {
      const regex = /^\d*\.?\d*$/; // decimales positivos
      if (regex.test(value) || value === '') {
        setFormData((prev) => ({ ...prev, [name]: value }));
      }
      return;
    }

    if (name === 'tipo_recurso') {
      setFormData((prev) => ({ ...prev, tipo_recurso: value, recurso_id: '' }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.nombre || !formData.descripcion || !formData.monto || !formData.tipo_recurso || !formData.recurso_id) {
      setMensaje('❌ Todos los campos son obligatorios');
      return;
    }
    if (parseFloat(formData.monto) <= 0) {
      setMensaje('❌ El monto debe ser mayor a 0');
      return;
    }

    try {
      const payload = {
        ...formData,
        monto: parseFloat(formData.monto),
        recurso_id: parseInt(formData.recurso_id),
        estado_id: parseInt(formData.estado_id),
      };

      if (editingTarifa) {
        await putJSON(`/api/tarifas/${editingTarifa.id_tarifa}`, payload);
        setMensaje('✅ Tarifa actualizada correctamente');
      } else {
        await postJSON('/api/tarifas', payload);
        setMensaje('✅ Tarifa creada correctamente');
      }

      setShowModal(false);
      setEditingTarifa(null);
      setFormData({
        nombre: '',
        descripcion: '',
        monto: '',
        tipo_recurso: '',
        recurso_id: '',
        estado_id: '1',
      });

      cargarDatos();
    } catch (error) {
      console.error('Error:', error);
      setMensaje('❌ ' + (error?.message || 'No se pudo guardar'));
    }
  };

  const handleEdit = (tarifa) => {
    setFormData({
      nombre: tarifa.t_nombre,
      descripcion: tarifa.t_descripcion,
      monto: tarifa.t_monto?.toString?.() ?? '',
      tipo_recurso: tarifa.recurso_tipo || (tarifa.inmueble_id_inmueble ? 'inmueble' : 'espacio'),
      recurso_id: tarifa.recurso_id || tarifa.inmueble_id_inmueble || tarifa.espacios_publicos_id_espacio || '',
      estado_id: String(tarifa.t_estado_id_estado ?? '1'),
    });
    setEditingTarifa(tarifa);
    setShowModal(true);
  };

  const handleDelete = async (idTarifa) => {
    if (!window.confirm('¿Estás seguro de eliminar esta tarifa?')) return;

    try {
      await deleteJSON(`/api/tarifas/${idTarifa}`);
      setMensaje('✅ Tarifa eliminada correctamente');
      cargarDatos();
    } catch (error) {
      console.error('Error:', error);
      setMensaje('❌ ' + (error?.message || 'No se pudo eliminar'));
    }
  };

  const openModal = () => {
    setShowModal(true);
    setEditingTarifa(null);
    setFormData({
      nombre: '',
      descripcion: '',
      monto: '',
      tipo_recurso: '',
      recurso_id: '',
      estado_id: '1',
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTarifa(null);
    setFormData({
      nombre: '',
      descripcion: '',
      monto: '',
      tipo_recurso: '',
      recurso_id: '',
      estado_id: '1',
    });
  };

  if (loading) {
    return (
      <div className="configurar-tarifas-container">
        <div className="loading">Cargando configuración de tarifas...</div>
      </div>
    );
  }

  return (
    <div className="configurar-tarifas-container">
      <h2>⚙️ Configuración de Tarifas</h2>

      {mensaje && (
        <div className={`mensaje ${mensaje.includes('✅') ? 'exito' : 'error'}`}>
          {mensaje}
        </div>
      )}

      <div className="tarifas-header">
        <button className="btn-nueva-tarifa" onClick={openModal}>
          ➕ Nueva Tarifa
        </button>

        <div className="tarifas-stats">
          <div className="stat-card">
            <h4>Total Tarifas</h4>
            <span className="stat-number">{tarifas.length}</span>
          </div>
          <div className="stat-card active">
            <h4>Activas</h4>
            <span className="stat-number">
              {tarifas.filter((t) => Number(t.t_estado_id_estado) === 1).length}
            </span>
          </div>
          <div className="stat-card inactive">
            <h4>Inactivas</h4>
            <span className="stat-number">
              {tarifas.filter((t) => Number(t.t_estado_id_estado) === 7).length}
            </span>
          </div>
        </div>
      </div>

      {/* Tabla de tarifas */}
      <div className="tarifas-table-container">
        <table className="tarifas-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Descripción</th>
              <th>Monto</th>
              <th>Recurso</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tarifas.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-data">
                  No hay tarifas configuradas
                </td>
              </tr>
            ) : (
              tarifas.map((tarifa) => {
                const estado = Number(tarifa.t_estado_id_estado);
                const esActiva = estado === 1;
                const esInactiva = estado === 7;

                return (
                  <tr key={tarifa.id_tarifa} className={esActiva ? 'active' : 'inactive'}>
                    <td>#{tarifa.id_tarifa}</td>
                    <td>{tarifa.t_nombre}</td>
                    <td>{tarifa.t_descripcion}</td>
                    <td>Q{parseFloat(tarifa.t_monto).toFixed(2)}</td>
                    <td>
                      <span className="recurso-badge">
                        {(tarifa.recurso_tipo || (tarifa.inmueble_id_inmueble ? 'inmueble' : 'espacio')) === 'inmueble'
                          ? '🛋️' : '🏛️'}{' '}
                        {getNombreRecurso(
                          tarifa.recurso_tipo || (tarifa.inmueble_id_inmueble ? 'inmueble' : 'espacio'),
                          tarifa.recurso_id || tarifa.inmueble_id_inmueble || tarifa.espacios_publicos_id_espacio,
                          tarifa.recurso_nombre
                        )}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`estado-badge ${esActiva ? 'activo' : esInactiva ? 'inactivo' : 'otro'}`}
                      >
                        {esActiva ? 'Activo' : esInactiva ? 'Inactivo' : `Estado ${estado}`}
                      </span>
                    </td>
                    <td>
                      <div className="acciones-buttons">
                        <button
                          className="btn-editar"
                          onClick={() => handleEdit(tarifa)}
                          title="Editar tarifa"
                        >
                          ✏️
                        </button>
                        <button
                          className="btn-eliminar"
                          onClick={() => handleDelete(tarifa.id_tarifa)}
                          title="Eliminar tarifa"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal para crear/editar tarifa */}
      {showModal && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingTarifa ? '✏️ Editar Tarifa' : '➕ Crear Nueva Tarifa'}</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>

            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label>Nombre de la Tarifa:</label>
                <input
                  type="text"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  placeholder="Ej: Tarifa de uso de sillas"
                  required
                  maxLength="100"
                />
              </div>

              <div className="form-group">
                <label>Descripción:</label>
                <textarea
                  name="descripcion"
                  value={formData.descripcion}
                  onChange={handleChange}
                  placeholder="Describe la tarifa..."
                  required
                  maxLength="255"
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label>Monto (Q):</label>
                <input
                  type="text"
                  name="monto"
                  value={formData.monto}
                  onChange={handleChange}
                  placeholder="Ej: 50.00"
                  required
                />
              </div>

              <div className="form-group">
                <label>Tipo de Recurso:</label>
                <select
                  name="tipo_recurso"
                  value={formData.tipo_recurso}
                  onChange={handleChange}
                  required
                >
                  <option value="">-- Selecciona tipo --</option>
                  <option value="inmueble">Inmueble</option>
                  <option value="espacio">Espacio Público</option>
                </select>
              </div>

              {formData.tipo_recurso === 'inmueble' && (
                <div className="form-group">
                  <label>Inmueble:</label>
                  <select
                    name="recurso_id"
                    value={formData.recurso_id}
                    onChange={handleChange}
                    required
                  >
                    <option value="">-- Selecciona inmueble --</option>
                    {inmuebles.map((inmueble) => {
                      const id = getIdFrom(inmueble, 'inmueble');
                      const nombre = getNombreFrom(inmueble, 'inmueble');
                      return (
                        <option key={id} value={id}>
                          {nombre}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {formData.tipo_recurso === 'espacio' && (
                <div className="form-group">
                  <label>Espacio Público:</label>
                  <select
                    name="recurso_id"
                    value={formData.recurso_id}
                    onChange={handleChange}
                    required
                  >
                    <option value="">-- Selecciona espacio --</option>
                    {espacios.map((espacio) => {
                      const id = getIdFrom(espacio, 'espacio');
                      const nombre = getNombreFrom(espacio, 'espacio');
                      return (
                        <option key={id} value={id}>
                          {nombre}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Estado:</label>
                <select
                  name="estado_id"
                  value={formData.estado_id}
                  onChange={handleChange}
                  required
                >
                  <option value="1">Activo</option>
                  <option value="7">Inactivo</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancelar" onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="btn-guardar">
                  {editingTarifa ? 'Actualizar' : 'Crear'} Tarifa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConfigurarTarifas;
