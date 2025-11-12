// middleware/auth.js
const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || req.query.token || req.body?.token; // fallback útil en pruebas

  if (!token) return res.status(401).json({ error: 'Token requerido' });

  try {
    const p = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');

    // Normaliza campos esperados por el resto del código
    req.user = {
      id: p.sub ?? p.id ?? p.userId ?? p.id_usuario ?? null,          // 👈 importante
      rol: p.rol ?? p.role ?? p.u_rol_id_rolu ?? null,                // opcional extra
      usuario: p.usu ?? p.usuario ?? p.username ?? p.u_usuario ?? null,
      nombre: p.nombre ?? p.u_nombre ?? null,
      correo: p.correo ?? p.u_correo ?? null,
      raw: p,
    };

    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    return next();
  };
}



module.exports = { auth, requireRole };
