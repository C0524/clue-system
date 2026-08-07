function isPendingBookStatus(book){
  const normalized = (book == null ? '' : String(book)).trim();
  return normalized === '' || normalized === '未预约';
}

function isRestoredFromPublicPool(rec){
  const note = rec && rec.assignNote ? String(rec.assignNote) : '';
  if(!note) return false;
  return note.indexOf('公海再分配') !== -1;
}

function getExpireBaseTime(rec){
  if(!rec) return '';
  if(isRestoredFromPublicPool(rec) && rec.assignedAt) return rec.assignedAt;
  return rec.createTime || '';
}

// 统一的“过期单”判定函数：
// 0. 显式标记 expired=1 或意向=“无效”始终视为过期（不受 30 天保护期影响）；
// 1. 其余记录的保护期基准默认从 createTime 起算；若是公海再分配还原单，则从 assignedAt 起算；30 天内不按系统规则判过期；
// 2. 保护期结束后，以“最后一次回访时间”和“还原分配时间”两者较晚者为准，满 15 天且仍未预约则视为过期。
//    若第 15 天又新增回访记录，则从该条最新回访记录时间重新顺延 15 天。
function computeExpired(rec, lastVisitTime){
  try{
    if(!rec) return false;
    if(Number(rec.expired) === 1 || rec.expired === true) return true;
    if(('' + (rec.intent || '')).toString() === '无效') return true;
    const baseTime = getExpireBaseTime(rec);
    const createTs = baseTime ? new Date(baseTime).getTime() : 0;
    const days30 = 30 * 24 * 3600 * 1000;
    if(createTs && !isNaN(createTs) && (createTs + days30 > Date.now())) return false;
    const effectiveLastVisitTime = typeof lastVisitTime !== 'undefined'
      ? lastVisitTime
      : (typeof rec.lastVisitTime !== 'undefined' ? rec.lastVisitTime : rec.lastTime);
    const lastTsRaw = effectiveLastVisitTime ? new Date(effectiveLastVisitTime).getTime() : 0;
    const baseTs = baseTime ? new Date(baseTime).getTime() : 0;
    const lastTs = Math.max(lastTsRaw || 0, baseTs || 0);
    if(!lastTs || isNaN(lastTs)) return false;
    const days15 = 15 * 24 * 3600 * 1000;
    if(lastTs + days15 > Date.now()) return false;
    return isPendingBookStatus(rec.book);
  }catch(e){
    console.warn('computeExpired error', e);
    return false;
  }
}

module.exports = {
  isPendingBookStatus,
  isRestoredFromPublicPool,
  getExpireBaseTime,
  computeExpired,
};
