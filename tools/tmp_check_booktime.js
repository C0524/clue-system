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

  const [bookedRows] = await pool.query("SELECT COUNT(*) AS c FROM clues WHERE book='已预约'");
  const [missingRows] = await pool.query("SELECT COUNT(*) AS c FROM clues WHERE book='已预约' AND (bookTime IS NULL OR bookTime='')");

  console.log(JSON.stringify({
    booked: Number(bookedRows[0].c || 0),
    missingBookTime: Number(missingRows[0].c || 0),
  }, null, 2));

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
