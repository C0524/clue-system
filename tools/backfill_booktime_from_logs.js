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

function chooseLater(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
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

  const [missingRows] = await pool.query(
    "SELECT id, visitDate, createTime FROM clues WHERE book='已预约' AND (bookTime IS NULL OR bookTime='')"
  );

  if (!missingRows || missingRows.length === 0) {
    console.log('No booked clues missing bookTime. Nothing to do.');
    await pool.end();
    return;
  }

  const [logRows] = await pool.query(
    "SELECT time, text FROM logs WHERE text LIKE '%book=%' OR text LIKE '%keys=%book%'"
  );

  const explicitBooked = new Map();
  const anyBookOp = new Map();

  for (const r of logRows) {
    const text = (r && r.text) ? String(r.text) : '';
    const t = normalizeToDateTime(r && r.time);
    if (!text || !t) continue;

    const m1 = text.match(/修改\s+(\d+)\s+book=已预约/);
    if (m1) {
      const id = m1[1];
      explicitBooked.set(id, chooseLater(explicitBooked.get(id), t));
      anyBookOp.set(id, chooseLater(anyBookOp.get(id), t));
      continue;
    }

    const m2 = text.match(/修改\s+(\d+)\s+book=/);
    if (m2) {
      const id = m2[1];
      anyBookOp.set(id, chooseLater(anyBookOp.get(id), t));
      continue;
    }

    const m3 = text.match(/批量修改\s+(\d+)\s+keys=.*\bbook\b/);
    if (m3) {
      const id = m3[1];
      anyBookOp.set(id, chooseLater(anyBookOp.get(id), t));
    }
  }

  let byExplicit = 0;
  let byAnyOp = 0;
  let skipped = 0;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const row of missingRows) {
      const id = String(row.id);
      let bt = null;
      let source = '';

      const ex = explicitBooked.get(id);
      const any = anyBookOp.get(id);

      if (ex) {
        bt = ex;
        source = 'explicit';
      } else if (any) {
        bt = any;
        source = 'anyBookOp';
      }

      if (!bt) {
        skipped += 1;
        continue;
      }

      const [ret] = await conn.query(
        "UPDATE clues SET bookTime = ? WHERE id = ? AND book='已预约' AND (bookTime IS NULL OR bookTime='')",
        [bt, row.id]
      );

      if (ret && ret.affectedRows > 0) {
        if (source === 'explicit') byExplicit += 1;
        else if (source === 'anyBookOp') byAnyOp += 1;
      }
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  const [afterRows] = await pool.query(
    "SELECT COUNT(*) AS c FROM clues WHERE book='已预约' AND (bookTime IS NULL OR bookTime='')"
  );

  console.log(JSON.stringify({
    totalMissingBefore: missingRows.length,
    filledByExplicitBookedLog: byExplicit,
    filledByAnyBookOperationLog: byAnyOp,
    skipped,
    totalMissingAfter: Number(afterRows[0].c || 0),
  }, null, 2));

  await pool.end();
})().catch((e) => {
  console.error('Backfill failed:', e && e.message ? e.message : e);
  process.exit(1);
});
