// scripts/setUserPassword.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

(async () => {
  try {
    const usernameOrEmail = process.argv[2]; // ej: admin o admin@sjp.gob.gt
    const nuevaPlano = process.argv[3];      // ej: Admin#123

    if (!usernameOrEmail || !nuevaPlano) {
      console.log('Uso: node scripts/setUserPassword.js <usuario|correo> <nuevaPassword>');
      process.exit(1);
    }

    const hash = await bcrypt.hash(nuevaPlano, 10);

    const { rowCount } = await pool.query(
      `UPDATE usuario
         SET u_contrasenia = $1
       WHERE LOWER(u_usuario)=LOWER($2) OR LOWER(u_correo)=LOWER($2)`,
      [hash, usernameOrEmail]
    );

    if (!rowCount) {
      console.log('No se encontró usuario.');
    } else {
      console.log('✅ Password actualizada.');
    }
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
