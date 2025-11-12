// db.js
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',         
  host: '127.0.0.1',       
  database: 'MuniSJP',  
  password: 'admin',   
  port: 5432,                  
});

pool.connect()
  .then(client => {
    return client
      .query('SELECT NOW()')
      .then(res => {
        client.release();
        console.log('Conectado a PostgreSQL. Hora actual:', res.rows[0]);
      })
      .catch(err => {
        client.release();
        console.error('Error al ejecutar consulta:', err.stack);
      });
  })
  .catch(err => {
    console.error('No se pudo conectar a PostgreSQL:', err.stack);
  });

module.exports = pool;
