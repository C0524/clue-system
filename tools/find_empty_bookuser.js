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
  const outPath = path.join(__dirname, 'find_empty_bookuser_output.json');
  const conn = await mysql.createConnection(DB_CONFIG);
  try{
    const sql = "SELECT id, taoRen, createTime, book, COALESCE(bookUser,'') as bookUser FROM clues WHERE book = '已预约' AND (bookUser IS NULL OR TRIM(bookUser) = '') LIMIT 1000";
    const [rows] = await conn.execute(sql);
    fs.writeFileSync(outPath, JSON.stringify({ time: new Date().toISOString(), count: rows.length, rows }, null, 2), 'utf8');
    console.log('Wrote', outPath, 'count=', rows.length);
  }catch(e){
    console.error('query failed', e.message || e);
    try{ fs.writeFileSync(outPath, JSON.stringify({ time: new Date().toISOString(), error: e.message || String(e) }, null, 2)); }catch(_){}
    process.exit(2);
  }finally{
    try{ await conn.end(); }catch(_){}
  }
})();
