async function prewarmCachesOnStart(ctx){
  const query = ctx.query;
  const env = ctx.env || process.env;

  const enabled = env.PREWARM_ON_START !== '0';
  if(!enabled) return;

  const startTs = Date.now();
  const warmupQueries = [
    'SELECT COUNT(*) AS c FROM clues',
    "SELECT COUNT(*) AS c FROM clues WHERE book = '已预约'",
    "SELECT COUNT(*) AS c FROM clues WHERE book = '已预约' AND arrive = '已到诊'",
    'SELECT id, username, role FROM users ORDER BY id DESC LIMIT 200',
    'SELECT id, name, dept, operator FROM doctors ORDER BY id DESC LIMIT 200',
    'SELECT id, createTime, visitDate, book, bookUser, doctor, regDoctor, revisitGroupId FROM clues ORDER BY id DESC LIMIT 3000',
    'SELECT id, clueId, time, user FROM visits ORDER BY id DESC LIMIT 3000'
  ];

  let failed = 0;
  for(const sql of warmupQueries){
    try{
      await query(sql);
    }catch(e){
      failed += 1;
      console.warn('启动预热单条失败：', e && e.message ? e.message : e);
    }
  }

  const cost = Date.now() - startTs;
  if(failed > 0){
    console.warn(`启动预热完成（部分失败 ${failed}/${warmupQueries.length}），耗时 ${cost}ms`);
  }else{
    console.log(`启动预热完成，耗时 ${cost}ms`);
  }
}

module.exports = {
  prewarmCachesOnStart,
};
