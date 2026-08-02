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
  const inputJson = path.join(__dirname, 'find_empty_bookuser_output.json');
  const outJson = path.join(__dirname, 'suggest_bookuser_preview.json');
  const outCsv = path.join(__dirname, 'suggest_bookuser_preview.csv');
  if(!fs.existsSync(inputJson)){
    console.error('input not found:', inputJson); process.exit(2);
  }
  const data = JSON.parse(fs.readFileSync(inputJson,'utf8'));
  const ids = (data.rows || []).map(r=>r.id);
  const conn = await mysql.createConnection(DB_CONFIG);
  const results = [];
  try{
    for(const id of ids){
      // find recent logs that mention this id and book/bookUser
      const sql = "SELECT time, user, text FROM logs WHERE text LIKE CONCAT('%', ?, '%') AND (text LIKE '%book%' OR text LIKE '%bookUser%') ORDER BY time DESC LIMIT 10";
      const [rows] = await conn.execute(sql, [String(id)]);
      let suggestion = '';
      let reason = '';
      if(rows && rows.length > 0){
        // Prefer explicit bookUser modification entries in text
        for(const r of rows){
          const t = r.text || '';
          if(t.indexOf('bookUser=') !== -1){ suggestion = r.user; reason = 'log:bookUser'; break; }
        }
        if(!suggestion){
          // fallback to any book change
          for(const r of rows){
            const t = r.text || '';
            if(t.indexOf('book=') !== -1){ suggestion = r.user; reason = 'log:book'; break; }
          }
        }
        if(!suggestion){ suggestion = rows[0].user; reason = 'log:recent'; }
      }else{
        // no logs; attempt to use visits table who created visit? Not implemented here
        suggestion = '';
        reason = 'no_log';
      }
      results.push({ id, suggestedBookUser: suggestion, reason });
    }
    fs.writeFileSync(outJson, JSON.stringify({ time: new Date().toISOString(), results }, null, 2), 'utf8');
    // write csv
    const header = 'id,suggestedBookUser,reason\n';
    const lines = results.map(r => `${r.id},${r.suggestedBookUser || ''},${r.reason}`);
    fs.writeFileSync(outCsv, header + lines.join('\n'), 'utf8');
    console.log('Wrote preview:', outJson, outCsv);
  }catch(e){ console.error('failed', e.message || e); }
  finally{ try{ await conn.end(); }catch(_){} }
})();
