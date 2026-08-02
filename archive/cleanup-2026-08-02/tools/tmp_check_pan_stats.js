const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'clue_system',
    port: Number(process.env.DB_PORT || 3306),
  });

  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01 00:00:00`;
  const end = `${now.getFullYear()}-${String(now.getMonth()+2).padStart(2,'0')}-01 00:00:00`;

  const [users] = await conn.execute("SELECT username, role FROM users WHERE username LIKE ? ORDER BY username", ['%玲玲%']);
  console.log('users_like_玲玲=', users);

  for (const u of users) {
    const name = u.username;
    const q = async (sql, p) => {
      const [r] = await conn.execute(sql, p);
      return Number(r[0].cnt || 0);
    };

    const assignedTo = await q(
      "SELECT COUNT(*) cnt FROM clues WHERE createTime>=? AND createTime<? AND COALESCE(revisitGroupId,'')='' AND assignedTo=?",
      [start, end, name]
    );
    const bookUser = await q(
      "SELECT COUNT(*) cnt FROM clues WHERE createTime>=? AND createTime<? AND COALESCE(revisitGroupId,'')='' AND bookUser=?",
      [start, end, name]
    );
    const intentOperator = await q(
      "SELECT COUNT(*) cnt FROM clues WHERE createTime>=? AND createTime<? AND COALESCE(revisitGroupId,'')='' AND intentOperator=?",
      [start, end, name]
    );
    const taoRen = await q(
      "SELECT COUNT(*) cnt FROM clues WHERE createTime>=? AND createTime<? AND COALESCE(revisitGroupId,'')='' AND taoRen=?",
      [start, end, name]
    );

    console.log({ name, role: u.role, start, end, assignedTo, bookUser, intentOperator, taoRen });
  }

  await conn.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
