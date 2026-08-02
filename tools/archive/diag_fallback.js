const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'clue_system',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  timezone: process.env.DB_TIMEZONE || '+08:00',
  dateStrings: true
};

(async ()=>{
  const conn = await mysql.createConnection(DB_CONFIG);
  try{
    const sql = `SELECT c.id,
      (SELECT user FROM visits WHERE clueId = c.id ORDER BY time ASC LIMIT 1) AS firstVisitUser,
      (SELECT COUNT(*) FROM visits WHERE clueId = c.id) AS visitCount
      FROM clues c
      WHERE (SELECT COUNT(*) FROM visits WHERE clueId = c.id) > 0
      AND ((SELECT user FROM visits WHERE clueId = c.id ORDER BY time ASC LIMIT 1) IS NULL OR (SELECT user FROM visits WHERE clueId = c.id ORDER BY time ASC LIMIT 1) = '')
      LIMIT 100`;
    const [rows] = await conn.query(sql);
    console.log('rows with visits but missing firstVisitUser (sample up to 100):', rows.length);
    for(const r of rows) console.log(r);

    // Also report count of clues that have visits but no fallback consultant per old logic
    const sql2 = `SELECT COUNT(*) as c FROM clues c WHERE (SELECT COUNT(*) FROM visits WHERE clueId = c.id) > 0 AND COALESCE(c.assignedTo,'') = '' AND COALESCE(c.bookUser,'') = '' AND COALESCE(c.intentOperator,'') = '' AND (SELECT user FROM logs WHERE text LIKE CONCAT('%修改 ', c.id, ' intent=%') ORDER BY time DESC LIMIT 1) IS NULL`;
    const [r2] = await conn.query(sql2);
    console.log('count where visits exist but assigned/book/intent/logs empty:', r2[0].c);
      const sql3 = `SELECT c.id, (SELECT user FROM visits WHERE clueId = c.id ORDER BY time ASC LIMIT 1) AS firstVisitUser, (SELECT COUNT(*) FROM visits WHERE clueId = c.id) AS visitCount FROM clues c WHERE (SELECT COUNT(*) FROM visits WHERE clueId = c.id) > 0 AND COALESCE(c.assignedTo,'') = '' AND COALESCE(c.bookUser,'') = '' AND COALESCE(c.intentOperator,'') = '' AND (SELECT user FROM logs WHERE text LIKE CONCAT('%修改 ', c.id, ' intent=%') ORDER BY time DESC LIMIT 1) IS NULL LIMIT 50`;
      const [r3] = await conn.query(sql3);
      console.log('sample rows where visits exist but no assigned/book/intent/logs (up to 50):', r3.length);
      for(const x of r3) console.log(x);
  }catch(e){ console.error(e); }
  finally{ await conn.end(); }
})();
