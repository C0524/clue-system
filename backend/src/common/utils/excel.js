// 将 Excel 序列日期（例如 46154.75）或标准字符串日期转为 MySQL DATETIME 字符串 YYYY-MM-DD HH:mm:ss
function excelSerialToDateString(v){
  if(v === null || v === undefined || v === '') return null;
  // 如果已经是合理的字符串（包含 - 或 :），直接返回
  if(typeof v === 'string' && /[-:\s]/.test(v)){
    return v;
  }
  let num = null;
  if(typeof v === 'number') num = v;
  else if(typeof v === 'string' && /^[0-9\.]+$/.test(v)) num = Number(v);
  if(num === null || !Number.isFinite(num)) return null;
  try{
    // Excel 序列：以 1899-12-30 为基点（兼容 1900 年闰年 bug）
    const base = Date.UTC(1899,11,30);
    const ms = Math.round(num * 24 * 60 * 60 * 1000);
    const dt = new Date(base + ms);
    const pad2 = n => n.toString().padStart(2, '0');
    const Y = dt.getUTCFullYear();
    const M = pad2(dt.getUTCMonth() + 1);
    const D = pad2(dt.getUTCDate());
    const h = pad2(dt.getUTCHours());
    const m = pad2(dt.getUTCMinutes());
    const s = pad2(dt.getUTCSeconds());
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  }catch(_){
    return null;
  }
}

module.exports = {
  excelSerialToDateString,
};
