async function initDatabase(ctx){
  const mysql = ctx.mysql;
  const dbConfig = ctx.dbConfig;
  const setPool = ctx.setPool;
  const query = ctx.query;
  const execute = ctx.execute;
  const runStartupDbMigrations = ctx.runStartupDbMigrations;
  const ensureCluesExpiredCols = ctx.ensureCluesExpiredCols;
  const backfillBookedClueTimesFromLogs = ctx.backfillBookedClueTimesFromLogs;

  try{
    // 先确保数据库存在（如果使用 db-migrate.js 可跳过）
    const tmp = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port,
    });
    await tmp.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await tmp.end();

    const pool = mysql.createPool(dbConfig);
    setPool(pool);
    console.log('MySQL pool created');

    await runStartupDbMigrations({ query, execute, backfillBookedClueTimesFromLogs });
    await ensureCluesExpiredCols({ query, execute });
  }catch(e){
    console.error('MySQL init error', e);
    process.exit(1);
  }
}

module.exports = {
  initDatabase,
};
