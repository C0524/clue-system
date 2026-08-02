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
    const d = new Date();
    const stamp = d.getFullYear().toString()
      + ('' + (d.getMonth()+1)).padStart(2,'0')
      + ('' + d.getDate()).padStart(2,'0') + '_' 
      + ('' + d.getHours()).padStart(2,'0')
      + ('' + d.getMinutes()).padStart(2,'0')
      + ('' + d.getSeconds()).padStart(2,'0');
    const backupTable = `migration_backup_clue_visitstatus_${stamp}`;
    console.log('Backup table will be', backupTable);
    // 1) create backup of affected rows
    const backupSql = `CREATE TABLE ${backupTable} AS
      SELECT id, visitStatus as oldVisitStatus, intent, (SELECT COUNT(*) FROM visits v WHERE v.clueId = clues.id) AS visitsCount, NOW() as backupAt
      FROM clues WHERE COALESCE(intent,'') <> '' AND (COALESCE(visitStatus,'') NOT REGEXP '^[0-9]+访$')`;
    console.log('Creating backup...');
    await conn.query(backupSql);
    console.log('Backup created.');

    // 2) perform update: for each clue with intent non-empty and visitStatus not numeric-访,
    // set visitStatus = CASE WHEN visitsCount <= 0 THEN '1访' WHEN visitsCount = 1 THEN '2访' ELSE '3访' END
    const updateSql = `UPDATE clues c
      LEFT JOIN (SELECT clueId, COUNT(*) AS cts FROM visits GROUP BY clueId) v ON c.id = v.clueId
      SET c.visitStatus = CASE WHEN COALESCE(v.cts,0) <= 0 THEN '1访' WHEN v.cts = 1 THEN '2访' ELSE '3访' END
      WHERE COALESCE(c.intent,'') <> '' AND (COALESCE(c.visitStatus,'') NOT REGEXP '^[0-9]+访$')`;
    console.log('Updating clues...');
    const [res] = await conn.query(updateSql);
    console.log('Update affectedRows:', res.affectedRows);

    console.log('Migration finished successfully. Backup table:', backupTable);
  }catch(e){
    console.error('Migration failed', e && e.message);
  }finally{
    await conn.end();
  }
})();
