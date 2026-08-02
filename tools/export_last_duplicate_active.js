const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'clue_system',
    port: 3306,
  });

  try {
    const [logs] = await conn.query(
      "SELECT id, time, user, text FROM logs WHERE text LIKE ? ORDER BY id DESC LIMIT 1",
      ['批量导入线索：%']
    );
    if (!logs || logs.length === 0) {
      throw new Error('未找到批量导入日志');
    }
    const last = logs[0];

    const [rows] = await conn.query(
      `SELECT id, createTime, reason, phone, wechat, raw
       FROM import_skips
       WHERE reason = 'duplicate_active'
         AND createTime >= DATE_SUB(?, INTERVAL 10 MINUTE)
         AND createTime <= DATE_ADD(?, INTERVAL 10 MINUTE)
       ORDER BY id ASC`,
      [last.time, last.time]
    );

    const out = rows.map((r, idx) => {
      let raw = {};
      try { raw = r.raw ? JSON.parse(r.raw) : {}; } catch (_) { raw = {}; }
      return {
        序号: idx + 1,
        skipId: r.id,
        skipTime: r.createTime,
        reason: r.reason,
        phone: r.phone || '',
        wechat: r.wechat || '',
        name: raw.name || '',
        channel: raw.channel || '',
        doctor: raw.doctor || '',
        regDoctor: raw.regDoctor || '',
        taoRen: raw.taoRen || '',
        bookUser: raw.bookUser || '',
        intent: raw.intent || '',
        content: raw.content || '',
        createTime_raw: raw.createTime || '',
      };
    });

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const baseName = `duplicate_active_last_import_${out.length}rows_${stamp}`;
    const xlsxPath = path.join(process.cwd(), 'tools', `${baseName}.xlsx`);
    const csvPath = path.join(process.cwd(), 'tools', `${baseName}.csv`);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(out);
    XLSX.utils.book_append_sheet(wb, ws, 'duplicate_active');
    XLSX.writeFile(wb, xlsxPath);

    const csv = XLSX.utils.sheet_to_csv(ws);
    fs.writeFileSync(csvPath, '\uFEFF' + csv, 'utf8');

    const summary = {
      lastImportLog: {
        id: last.id,
        time: last.time,
        user: last.user,
        text: last.text,
      },
      exportedRows: out.length,
      xlsxPath,
      csvPath,
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
