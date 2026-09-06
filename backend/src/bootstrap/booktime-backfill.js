function createBackfillBookedClueTimesFromLogs(ctx){
  const query = ctx.query;
  const execute = ctx.execute;
  const nowStr = ctx.nowStr;

  return async function backfillBookedClueTimesFromLogs(){
    try{
      const logRows = await query("SELECT time, text FROM logs WHERE text LIKE '%book=已预约%' ORDER BY time ASC");
      const bookTimeById = new Map();
      for(const row of logRows || []){
        const text = String(row && row.text ? row.text : '');
        const match = text.match(/^(?:修改|批量修改)\s+(\d+)\s+book=已预约$/);
        if(match){
          bookTimeById.set(match[1], row.time);
        }
      }

      const clueRows = await query("SELECT id, createTime, bookTime FROM clues WHERE book = '已预约'");
      let updated = 0;
      let fallbackCount = 0;
      for(const clue of clueRows || []){
        if(clue && clue.bookTime && String(clue.bookTime).trim() !== '') continue;
        const rawTime = bookTimeById.get(String(clue.id)) || clue.createTime || nowStr();
        const normalizedTime = String(rawTime).replace(/\//g, '-');
        await execute('UPDATE clues SET bookTime = ? WHERE id = ?', [normalizedTime, clue.id]);
        updated += 1;
        if(!bookTimeById.has(String(clue.id))) fallbackCount += 1;
      }

      console.log(`Backfilled bookTime for ${updated} booked clues` + (fallbackCount > 0 ? ` (${fallbackCount} used fallback createTime/now)` : ''));
    }catch(e){
      console.warn('backfillBookedClueTimesFromLogs failed', e && e.message ? e.message : e);
    }
  };
}

module.exports = {
  createBackfillBookedClueTimesFromLogs,
};
