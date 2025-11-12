// scripts/seedAdmin.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

(async () => {
  try {
    const usuario = 'admin';
    const correo  = 'admin@sjp.gob.gt';
    const passPlano = 'Admin#123'; // cámbiala luego
    const hash = await bcrypt.hash(passPlano, 10);

    const { rows: ex } = await pool.query(
      `SELECT 1 FROM usuario WHERE LOWER(u_usuario)=LOWER($1) OR LOWER(u_correo)=LOWER($2) LIMIT 1`,
      [usuario, correo]
    );
    if (ex.length) {
      console.log('Admin ya existe.');
      process.exit(0);
    }

    await pool.query(
      `INSERT INTO usuario
       (u_nombre, u_apellido, u_usuario, u_correo, u_contrasenia, u_rol_id_rolu, u_estado_id_estadou, cestados_id_catalogo, estado_id)
       VALUES ('Admin','SJP',$1,$2,$3,1,1,1,1)`,
      [usuario, correo, hash]
    );

    console.log(`✅ Admin creado: ${usuario} / ${correo} (pass: ${passPlano})`);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
