function createComputeExpiredAsync(ctx){
  const query = ctx.query;
  const computeExpired = ctx.computeExpired;

  let hasCluesExpiredColumn = null;

  async function queryClueBaseForExpired(id){
    const sqlWithExpired = 'SELECT id, intent, book, expired, createTime, assignNote, assignedAt FROM clues WHERE id = ? LIMIT 1';
    const sqlLegacy = 'SELECT id, intent, book, createTime, assignNote, assignedAt FROM clues WHERE id = ? LIMIT 1';
    if(hasCluesExpiredColumn === false){
      return query(sqlLegacy, [id]);
    }
    try{
      const rows = await query(sqlWithExpired, [id]);
      hasCluesExpiredColumn = true;
      return rows;
    }catch(e){
      const msg = String((e && (e.sqlMessage || e.message)) || '');
      if(e && e.code === 'ER_BAD_FIELD_ERROR' && msg.indexOf("'expired'") !== -1){
        hasCluesExpiredColumn = false;
        console.warn('clues.expired column missing, fallback to legacy clues query');
        return query(sqlLegacy, [id]);
      }
      throw e;
    }
  }

  return async function computeExpiredAsync(rec){
    try{
      if(!rec) return false;

      let fullRec = rec;
      if(rec.id && (typeof rec.intent === 'undefined' || typeof rec.book === 'undefined' || typeof rec.createTime === 'undefined' || typeof rec.assignNote === 'undefined' || typeof rec.assignedAt === 'undefined')){
        const baseRows = await queryClueBaseForExpired(rec.id);
        if(baseRows && baseRows[0]) fullRec = Object.assign({}, baseRows[0], rec);
      }
      if(!fullRec.id) return false;

      const rows = await query('SELECT MAX(time) AS lastTime FROM visits WHERE clueId = ?', [fullRec.id]);
      const lastTime = rows && rows[0] && rows[0].lastTime;
      return computeExpired(fullRec, lastTime);
    }catch(e){
      console.warn('computeExpiredAsync error', e);
      return false;
    }
  };
}

module.exports = {
  createComputeExpiredAsync,
};
