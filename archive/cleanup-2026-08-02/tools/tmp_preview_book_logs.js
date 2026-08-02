require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'clue_system',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
    timezone: '+08:00',
    dateStrings: true,
  });

  const [rows] = await pool.query(
    "SELECT time, user, text FROM logs WHERE text LIKE '%book=%' OR text LIKE '%keys=book%' ORDER BY time DESC LIMIT 80"
  );

  for (const r of rows) {
    console.log(`${r.time} | ${r.user} | ${r.text}`);
  }

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
