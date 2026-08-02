require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const id = '1782891459370';
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'clue_system',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
    timezone: '+08:00',
    dateStrings: true,
  });

  const [clueRows] = await pool.query(
    'SELECT id, book, bookTime, visitDate, createTime FROM clues WHERE id = ? LIMIT 1',
    [id]
  );
  console.log('CLUE:', JSON.stringify(clueRows[0] || null, null, 2));

  const [logRows] = await pool.query(
    'SELECT time, user, text FROM logs WHERE text LIKE ? ORDER BY time DESC LIMIT 30',
    ['%' + id + '%']
  );
  console.log('LOGS:');
  for (const r of logRows) {
    console.log(`${r.time} | ${r.user} | ${r.text}`);
  }

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
