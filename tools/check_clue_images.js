const mysql = require('mysql2/promise');
(async ()=>{
  try{
    const cfg = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'clue_system',
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
      dateStrings: true,
      timezone: process.env.DB_TIMEZONE || '+08:00'
    };
    const conn = await mysql.createConnection(cfg);
    const clueId = process.argv[2] || '1781224583299';
    console.log('Using DB config:', { host: cfg.host, user: cfg.user, database: cfg.database, port: cfg.port });
    console.log('Checking clue_images for clueId =', clueId);
    const [rows] = await conn.execute('SELECT id, clueId, visitId, url, `key`, filename, uploadedBy, uploadedAt, thumbSmallKey, thumbSmallUrl FROM clue_images WHERE clueId = ? ORDER BY uploadedAt ASC', [clueId]);
    console.log('clue_images rows:', rows.length);
    console.log(JSON.stringify(rows, null, 2));

    // check images associated via visits
    const [visRows] = await conn.execute('SELECT id FROM visits WHERE clueId = ?', [clueId]);
    const visitIds = visRows.map(r=>r.id);
    console.log('visitIds for clue:', visitIds);
    if(visitIds.length>0){
      const [vimg] = await conn.execute('SELECT id, clueId, visitId, url, `key`, filename, uploadedBy, uploadedAt, thumbSmallKey, thumbSmallUrl FROM clue_images WHERE visitId IN (?) ORDER BY uploadedAt ASC', [visitIds]);
      console.log('images by visitId count:', vimg.length);
      console.log(JSON.stringify(vimg, null, 2));
    }
    await conn.end();
  }catch(e){ console.error('error', e && e.message ? e.message : e); process.exit(1); }
})();