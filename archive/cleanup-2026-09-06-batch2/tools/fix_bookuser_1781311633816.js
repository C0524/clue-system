const mysql = require('mysql2/promise');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

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
  const id = 1781311633816;
  const suggested = '盘玲玲';
  const outDir = path.join(__dirname);
  const backupPath = path.join(outDir, `backup_clue_${id}.json`);
  const resultPath = path.join(outDir, `fix_result_${id}.json`);
  const conn = await mysql.createConnection(DB_CONFIG);
  try{
    const [rows] = await conn.execute('SELECT * FROM clues WHERE id = ?', [id]);
    if(!rows || rows.length === 0){
      const msg = `no row with id=${id}`;
      fs.writeFileSync(resultPath, JSON.stringify({ time: new Date().toISOString(), ok:false, msg }, null, 2), 'utf8');
      console.error(msg); process.exit(2);
    }
    const original = rows[0];
    fs.writeFileSync(backupPath, JSON.stringify({ time: new Date().toISOString(), original }, null, 2), 'utf8');

    // perform update
    await conn.execute('UPDATE clues SET bookUser = ? WHERE id = ?', [suggested, id]);

    // insert an audit log
    const now = new Date();
    const nowStr = now.toISOString().replace('T',' ').slice(0,19);
    const logText = `修复 ${id} bookUser=${suggested}（原=${original.bookUser || ''}）`;
    await conn.execute('INSERT INTO logs (`time`, `user`, `text`) VALUES (?,?,?)', [nowStr, 'system-fix', logText]);

    const [afterRows] = await conn.execute('SELECT id, book, bookUser FROM clues WHERE id = ?', [id]);
    const after = afterRows && afterRows[0] ? afterRows[0] : null;
    fs.writeFileSync(resultPath, JSON.stringify({ time: new Date().toISOString(), ok:true, id, original: { book: original.book, bookUser: original.bookUser }, after }, null, 2), 'utf8');
    console.log('Updated id=', id, 'new bookUser=', suggested);
  }catch(e){
    console.error('failed', e.message || e);
    try{ fs.writeFileSync(resultPath, JSON.stringify({ time: new Date().toISOString(), ok:false, error: e.message || String(e) }, null, 2)); }catch(_){}
    process.exit(2);
  }finally{
    try{ await conn.end(); }catch(_){}
  }
})();
