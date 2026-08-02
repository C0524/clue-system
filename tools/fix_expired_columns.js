require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'clue_system',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    charset: 'utf8mb4',
  };

  const conn = await mysql.createConnection(cfg);
  try {
    const [rows] = await conn.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'clues' AND COLUMN_NAME IN ('expired','expiredReason')",
      [cfg.database]
    );
    const exists = new Set((rows || []).map((r) => r.COLUMN_NAME));

    if (!exists.has('expired')) {
      await conn.query("ALTER TABLE clues ADD COLUMN expired TINYINT(1) DEFAULT 0");
      console.log('added column: expired');
    } else {
      console.log('column exists: expired');
    }

    if (!exists.has('expiredReason')) {
      await conn.query('ALTER TABLE clues ADD COLUMN expiredReason TEXT NULL');
      console.log('added column: expiredReason');
    } else {
      console.log('column exists: expiredReason');
    }

    const [verify] = await conn.query("SHOW COLUMNS FROM clues LIKE 'expired'");
    const [verify2] = await conn.query("SHOW COLUMNS FROM clues LIKE 'expiredReason'");
    console.log('verify expired:', verify && verify.length > 0 ? 'ok' : 'missing');
    console.log('verify expiredReason:', verify2 && verify2.length > 0 ? 'ok' : 'missing');
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
