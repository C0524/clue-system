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
    console.log('Fixing migrated visitStatus to use adj = max(1, visitsCount) for intent non-empty rows');
    // Backup affected rows to a table
    const d = new Date();
    const stamp = d.getFullYear().toString()
      + ('' + (d.getMonth()+1)).padStart(2,'0')
      + ('' + d.getDate()).padStart(2,'0') + '_'
      + ('' + d.getHours()).padStart(2,'0')
      + ('' + d.getMinutes()).padStart(2,'0')
      + ('' + d.getSeconds()).padStart(2,'0');
    const bak = `fix_backup_visitstatus_${stamp}`;
    console.log('Creating backup table', bak);
    await conn.query(`CREATE TABLE ${bak} AS SELECT id, visitStatus AS oldVisitStatus, intent, (SELECT COUNT(*) FROM visits v WHERE v.clueId = clues.id) AS visitsCount, NOW() AS backupAt FROM clues WHERE COALESCE(intent,'') <> '' AND (COALESCE(visitStatus,'') REGEXP '^[0-9]+访$')`);
    console.log('Backup done. Now updating rows...');
    // Update according to new rule: adj = min(3, max(1, visitsCount))
    const updateSql = `UPDATE clues c
      LEFT JOIN (SELECT clueId, COUNT(*) AS cts FROM visits GROUP BY clueId) v ON c.id = v.clueId
      SET c.visitStatus = CASE WHEN COALESCE(v.cts,0) <= 1 THEN '1访' WHEN v.cts = 2 THEN '2访' ELSE '3访' END
      WHERE COALESCE(c.intent,'') <> '' AND (COALESCE(c.visitStatus,'') REGEXP '^[0-9]+访$')`;
    const [res] = await conn.query(updateSql);
    console.log('Update affectedRows:', res.affectedRows);
    console.log('Done. Backup table:', bak);
  }catch(e){ console.error('Fix migration failed', e && e.message); }
  finally{ await conn.end(); }
})();
