require('dotenv').config();
const mysql = require('mysql2/promise');

function normalizeToDateTime(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

(async () => {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'clue_system',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
    timezone: '+08:00',
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 5,
  });

  const [logRows] = await pool.query(
    "SELECT text FROM logs WHERE text LIKE '%book=%' OR text LIKE '%keys=%book%'"
  );

  const hasBookLog = new Set();
  for (const r of logRows) {
    const text = r && r.text ? String(r.text) : '';
    if (!text) continue;

    const m1 = text.match(/修改\s+(\d+)\s+book=/);
    if (m1) {
      hasBookLog.add(m1[1]);
      continue;
    }

    const m2 = text.match(/批量修改\s+(\d+)\s+keys=.*\bbook\b/);
    if (m2) hasBookLog.add(m2[1]);
  }

  const [rows] = await pool.query(
    "SELECT id, visitDate, bookTime FROM clues WHERE book='已预约' AND bookTime IS NOT NULL AND bookTime <> ''"
  );

  const toRollback = [];
  for (const row of rows) {
    const id = String(row.id);
    if (hasBookLog.has(id)) continue;
    const vd = normalizeToDateTime(row.visitDate);
    const bt = normalizeToDateTime(row.bookTime);
    if (vd && bt && vd === bt) {
      toRollback.push(row.id);
    }
  }

  if (toRollback.length > 0) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const id of toRollback) {
        await conn.query("UPDATE clues SET bookTime = NULL WHERE id = ? AND book='已预约'", [id]);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  const [missingRows] = await pool.query(
    "SELECT COUNT(*) AS c FROM clues WHERE book='已预约' AND (bookTime IS NULL OR bookTime='')"
  );

  console.log(JSON.stringify({
    rolledBackVisitDateFallbackRows: toRollback.length,
    missingBookTimeAfterRollback: Number(missingRows[0].c || 0),
  }, null, 2));

  await pool.end();
})().catch((e) => {
  console.error('Rollback failed:', e && e.message ? e.message : e);
  process.exit(1);
});
