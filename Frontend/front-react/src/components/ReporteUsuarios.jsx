import React, { useEffect, useMemo, useState } from 'react';
import '../styles/Reportes.css';

const API = 'http://localhost:5000/api';

export default function ReporteUsuarios(){
  const [data,setData] = useState([]);
  const [q,setQ] = useState('');
  const [loading,setLoading] = useState(true);

  async function load(){
    setLoading(true);
    try{
      const r = await fetch(`${API}/reservas/listado`);
      const arr = await r.json().catch(()=>[]);
      setData(Array.isArray(arr)? arr: []);
    } finally{ setLoading(false); }
  }
  useEffect(()=>{ load(); }, []);

  const usuarios = useMemo(()=>{
    const map = new Map();
    data.forEach(r=>{
      const nom = r.solicitante_nombre || '—';
      const key = nom.toLowerCase().trim();
      const est = Number(r.estado_id||0);
      const it = map.get(key) || { nombre: nom, total:0, apro:0, pend:0, rech:0 };
      it.total++; if(est===5) it.apro++; else if(est===2) it.pend++; else if(est===6) it.rech++;
      map.set(key, it);
    });
    let list = [...map.values()];
    if(q.trim()) list = list.filter(x=>x.nombre.toLowerCase().includes(q.toLowerCase()));
    return list.sort((a,b)=>b.total-a.total);
  }, [data,q]);

  return (
    <div className="ana-wrap">
      <div className="ana-head">
        <div>
          <h2 className="ana-title">👥 Actividad de solicitantes</h2>
          <p className="ana-sub">Quiénes reservan más y sus resultados</p>
        </div>
        <div className="ana-actions">
          <input className="ana-input" placeholder="Buscar por nombre…" value={q} onChange={e=>setQ(e.target.value)} />
          <button className="ana-btn" onClick={load}>Actualizar</button>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <b>Ranking por cantidad de reservas</b>
          <span className="hint">Top solicitantes</span>
        </div>

        {loading ? <div className="empty">Cargando…</div> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>#</th><th>Solicitante</th><th>Total</th><th>Aprobadas</th><th>Pendientes</th><th>Rechazadas</th></tr>
              </thead>
              <tbody>
                {usuarios.map((u,i)=>(
                  <tr key={u.nombre + i}>
                    <td>{i+1}</td>
                    <td>{u.nombre}</td>
                    <td><b>{u.total}</b></td>
                    <td><span className="badge ok">{u.apro}</span></td>
                    <td><span className="badge busy">{u.pend}</span></td>
                    <td><span className="badge err">{u.rech}</span></td>
                  </tr>
                ))}
                {usuarios.length===0 && <tr><td colSpan="6" className="empty">Sin resultados</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
