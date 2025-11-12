import React, { useEffect, useMemo, useState } from 'react';
import '../styles/Reportes.css';

const API = 'http://localhost:5000/api';
const today = () => new Date().toISOString().slice(0,10);
const monthStart = () => { const d=new Date(); d.setDate(1); return d.toISOString().slice(0,10); };

export default function ReporteUso(){
  const [from,setFrom] = useState(monthStart());
  const [to,setTo]     = useState(today());
  const [items,setItems] = useState([]);
  const [loading,setLoading] = useState(true);

  async function load(){
    setLoading(true);
    try{
      const r = await fetch(`${API}/reservas/rango?from=${from}&to=${to}`);
      const data = await r.json().catch(()=>[]);
      setItems(Array.isArray(data)? data: []);
    } finally{ setLoading(false); }
  }
  useEffect(()=>{ load(); }, [from,to]);

  const uso = useMemo(()=>{
    const mm = new Map();
    items.forEach(x=>{
      const nombre = x.nombre_recurso || x.espacio || x.inmueble || '—';
      mm.set(nombre, (mm.get(nombre)||0)+1);
    });
    return [...mm.entries()].sort((a,b)=>b[1]-a[1]);
  }, [items]);

  return (
    <div className="ana-wrap">
      <div className="ana-head">
        <div>
          <h2 className="ana-title">🏟️ Uso de espacios/inmuebles</h2>
          <p className="ana-sub">Frecuencia de reservas por recurso</p>
        </div>
        <div className="ana-actions">
          <input className="ana-input" type="date" value={from} onChange={e=>setFrom(e.target.value)}/>
          <input className="ana-input" type="date" value={to} onChange={e=>setTo(e.target.value)}/>
          <button className="ana-btn" onClick={load}>Actualizar</button>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <b>Ranking de uso</b>
          <span className="hint">{from} → {to}</span>
        </div>

        {loading ? <div className="empty">Cargando…</div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Recurso</th><th>Reservas</th></tr></thead>
              <tbody>
                {uso.map(([nom,cnt],i)=>(
                  <tr key={nom}>
                    <td>{i+1}</td>
                    <td>{nom}</td>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div className="bar" style={{width:200}}><i style={{width:`${Math.min(100, cnt*15)}%`}}/></div>
                        <b>{cnt}</b>
                      </div>
                    </td>
                  </tr>
                ))}
                {uso.length===0 && <tr><td colSpan="3" className="empty">Sin resultados</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
