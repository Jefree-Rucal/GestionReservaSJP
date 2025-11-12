import React, { useEffect, useMemo, useState } from 'react';
import '../styles/CalendarioReservas.css';

/* ===== utilidades ===== */
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

const MES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DOW = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];

function monthTitle(d){ return `${MES[d.getMonth()]} de ${d.getFullYear()}`; }

function firstCell(base){
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const wd = first.getDay() === 0 ? 7 : first.getDay(); // 1..7 (lun..dom)
  const start = new Date(first);
  start.setDate(first.getDate() - (wd - 1));
  return start;
}
function buildCells(base){
  const start = firstCell(base);
  const out = [];
  for(let i=0;i<42;i++){
    const d = new Date(start);
    d.setDate(start.getDate()+i);
    out.push(d);
  }
  return out;
}

function toTime(h){
  if(!h) return '';
  if(/^\d{1,2}:\d{2}/.test(h)) return h;
  const d = new Date(h);
  if(isNaN(d)) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDate(v){
  if(!v) return null;
  // si viene como 'YYYY-MM-DD', créale hora 00:00
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00`);
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

/* ===== normalización con RANGO =====
   Intenta leer (en este orden) para inicio/fin:
   - fecha_inicio / fecha_fin
   - f_inicio / f_fin
   - fecha_desde / fecha_hasta
   - f_reserva_inicio / f_reserva_fin
   - (fallback) hora_inicio / hora_final (si traen fecha-hora)
   - (último fallback) fecha (mismo día)
*/
function normalizeRow(r){
  const id = r.id_reserva ?? r.id ?? (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));

  // posibles campos de inicio/fin
  const dIniRaw = r.fecha_inicio ?? r.f_inicio ?? r.fecha_desde ?? r.f_reserva_inicio ?? r.fecha ?? r.hora_inicio;
  const dFinRaw = r.fecha_fin   ?? r.f_fin   ?? r.fecha_hasta ?? r.f_reserva_fin   ?? r.hora_final ?? r.fecha;

  let dIni = toDate(dIniRaw);
  let dFin = toDate(dFinRaw);

  // si no hay fechas válidas, descarta
  if(!dIni && !dFin) return null;

  // si solo hay fin, usa fin como inicio
  if(!dIni && dFin) dIni = new Date(dFin);
  // si solo hay inicio, usa inicio como fin
  if(!dFin && dIni) dFin = new Date(dIni);

  // normalizar orden
  if(dFin < dIni) dFin = new Date(dIni);

  // array de días (keys) del rango [dIni..dFin]
  const days = [];
  const first = new Date(dIni.getFullYear(), dIni.getMonth(), dIni.getDate());
  const last  = new Date(dFin.getFullYear(), dFin.getMonth(), dFin.getDate());
  for(let dt = new Date(first); dt <= last; dt.setDate(dt.getDate()+1)){
    days.push(toKey(dt));
  }

  // horas "bonitas"
  const horaInicio = toTime(r.hora_inicio) || toTime(dIniRaw);
  const horaFinal  = toTime(r.hora_final)  || toTime(dFinRaw);

  return {
    id,
    days,
    startKey: toKey(dIni),
    endKey:   toKey(dFin),
    horaInicio,
    horaFinal,
    tipo: r.espacio_nombre ? 'Espacio' : (r.inmueble_nombre ? 'Mueble' : 'Reserva'),
    recurso: r.espacio_nombre || r.inmueble_nombre || r.recurso || '',
    solicitante: r.solicitante_nombre || r.solicitante || '',
    estado: r.estado_nombre || r.estado || '',
    cantidad: r.cantidad_reserva ?? r.cantidad ?? 1,
  };
}

/* ===== componente ===== */
export default function CalendarioReservas(){
  const hoy = new Date();
  const [base, setBase] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(toKey(hoy));

  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const cargar = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:5000/api/reservas/listado?estado=5'); // <-- ajusta si tu endpoint es otro
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : [];
      const arr = (Array.isArray(data) ? data.map(normalizeRow).filter(Boolean) : []);
      setReservas(arr);
      setMsg('');
    } catch (e) {
      console.error(e);
      setMsg('❌ Error al cargar reservas');
      setReservas([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(()=>{ cargar(); }, []);

  const cells = useMemo(()=>buildCells(base), [base]);

  // Expandimos cada reserva a "segmentos por día"
  const byDay = useMemo(()=>{
    const m = {};
    for(const r of reservas){
      for(const key of r.days){
        const segType = (key === r.startKey && key === r.endKey)
          ? 'single'
          : key === r.startKey ? 'start'
          : key === r.endKey   ? 'end'
          : 'mid';

        // Qué texto de hora mostrar según segmento
        let when = '';
        if (segType === 'single') {
          when = `${r.horaInicio} — ${r.horaFinal}`.trim();
        } else if (segType === 'start') {
          when = r.horaInicio ? `${r.horaInicio} →` : 'Inicio';
        } else if (segType === 'end') {
          when = r.horaFinal ? `← ${r.horaFinal}` : 'Fin';
        } else {
          when = 'Continúa';
        }

        const item = {
          ...r,
          segType,
          when,
          perDayKey: `${r.id}-${key}`,
        };
        (m[key] ||= []).push(item);
      }
    }
    // orden por tipo de segmento y hora (que se ve más organizado)
    const order = { start: 0, single: 1, mid: 2, end: 3 };
    for(const k in m){
      m[k].sort((a,b)=>{
        const oa = order[a.segType] ?? 99;
        const ob = order[b.segType] ?? 99;
        if (oa !== ob) return oa - ob;
        return String(a.horaInicio).localeCompare(String(b.horaInicio));
      });
    }
    return m;
  }, [reservas]);

  const list = byDay[selectedKey] || [];

  const next = ()=> setBase(d=>new Date(d.getFullYear(), d.getMonth()+1, 1));
  const prev = ()=> setBase(d=>new Date(d.getFullYear(), d.getMonth()-1, 1));
  const today= ()=> { const t=new Date(); setBase(new Date(t.getFullYear(), t.getMonth(), 1)); setSelectedKey(toKey(t)); };

  return (
    <div className="cr-wrap">
      <div className="cr-head">
        <div className="cr-left">
          <button className="cr-nav" onClick={prev}>◀</button>
          <h2 className="cr-title">{monthTitle(base)}</h2>
          <button className="cr-nav" onClick={next}>▶</button>
        </div>
        <div className="cr-right">
          <button className="cr-btn" onClick={today}>Hoy</button>
          <button className="cr-btn ok" onClick={cargar} title="Recargar">↻</button>
        </div>
      </div>

      {msg && <div className={`cr-msg ${msg.startsWith('❌')?'err':'ok'}`}>{msg}</div>}

      <div className="cr-main">
        {/* calendario */}
        <div className="cr-cal">
          {DOW.map(d=><div key={d} className="cr-dow">{d}</div>)}
          {cells.map((d,i)=>{
            const key = toKey(d);
            const inMonth = d.getMonth() === base.getMonth();
            const count = (byDay[key]?.length || 0);
            const isToday = key === toKey(new Date());
            const selected = key === selectedKey;
            return (
              <div
                key={i}
                className={[
                  'cr-cell',
                  inMonth ? '' : 'off',
                  isToday ? 'today' : '',
                  selected ? 'sel' : '',
                ].join(' ')}
                onClick={()=> setSelectedKey(key)}
                title={count ? `${count} reserva(s)` : ''}
              >
                <span className="cr-date">{d.getDate()}</span>
                {!!count && <span className="cr-badge">{count}</span>}
              </div>
            );
          })}
        </div>

        {/* detalle del día */}
        <aside className="cr-side">
          <div className="cr-side-h">
            {selectedKey
              ? new Date(selectedKey).toLocaleDateString('es-GT', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
              : 'Selecciona un día'}
            {selectedKey && <button className="cr-clear" onClick={()=>setSelectedKey('')}>Limpiar</button>}
          </div>

          {loading ? (
            <div className="cr-empty">Cargando…</div>
          ) : !selectedKey ? (
            <div className="cr-empty">Haz clic en un día del calendario</div>
          ) : list.length===0 ? (
            <div className="cr-empty">Sin reservas para este día</div>
          ) : (
            <div className="cr-list">
              {list.map(r=>(
                <div key={r.perDayKey} className="cr-item">
                  <div className="cr-time">
                    {r.when || '—'}
                    {(r.startKey !== r.endKey) && (
                      <span style={{marginLeft:8, fontWeight:700}}>
                        {r.segType==='start' && '▸'}
                        {r.segType==='mid'   && '⇢'}
                        {r.segType==='end'   && '◂'}
                      </span>
                    )}
                  </div>
                  <div className="cr-body">
                    <div className="cr-row">
                      <span className={`dot ${r.tipo==='Espacio'?'dot-space':'dot-inv'}`} />
                      <b>{r.tipo}</b>
                      <span className="cr-name">{r.recurso || '—'}</span>
                    </div>
                    <div className="cr-row small">👤 {r.solicitante || '—'}</div>
                    <div className="cr-row small">
                      <span className="badge">{r.estado || '—'}</span>
                      {r.cantidad>1 && <span className="qty">x{r.cantidad}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
