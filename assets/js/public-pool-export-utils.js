(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PublicPoolExportUtils = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  function formatExportDateTime(value) {
    if (!value && value !== 0) return '';
    const s = String(value).trim();
    if (!s) return '';
    const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?/);
    if (m) return m[2] ? `${m[1]} ${m[2]}` : m[1];
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function getExpiredReasonShortLabel(item) {
    if (!item) return '';
    const reason = item.expiredReason || item.expiredReasonType || '';
    const text = String(reason || '').trim();
    if (!text) return '-';
    const map = {
      invalid: '无效',
      system: '系统判定过期',
      expired: '过期',
      duplicate: '重复',
      over_limit: '超量'
    };
    return map[text] || text;
  }

  function getConsultForExport(item) {
    if (!item) return '';
    const visitStatus = item.visitStatus || '';
    if (item.assignedTo) return item.assignedTo;
    if (String(visitStatus).indexOf('访') !== -1 && item.firstVisitUser) return item.firstVisitUser;
    if (item.bookUser) return item.bookUser;
    if (item.intentOperator) return item.intentOperator;
    return '';
  }

  function buildPublicPoolExportPayload(search) {
    const payload = {};
    if (search) {
      const keys = ['id', 'assignedTo', 'channel', 'name', 'phone', 'wechat', 'doctor', 'regDoctor', 'startDate', 'endDate', 'timeType', 'timeStart', 'timeEnd', 'expiredReasonType'];
      keys.forEach((key) => {
        if (search[key]) payload[key] = search[key];
      });
    }
    payload.page = 1;
    payload.pageSize = 5000;
    return payload;
  }

  function mergeVisitSummary(visitsByClue, clueId) {
    const list = Array.isArray(visitsByClue && visitsByClue[clueId]) ? visitsByClue[clueId] : [];
    return list
      .map((v) => {
        const ts = formatExportDateTime(v && v.time ? v.time : '');
        const user = (v && v.user ? String(v.user).trim() : '').trim();
        const content = (v && v.content ? String(v.content).replace(/[\r\n]+/g, ' ').trim() : '').trim();
        const parts = [];
        if (ts) parts.push(ts);
        if (user) parts.push(user);
        const head = parts.join(' ');
        return head ? (content ? `${head}：${content}` : head) : content;
      })
      .filter(Boolean)
      .join(' ; ');
  }

  function buildPublicPoolExportRows(rows, visitsByClue) {
    const list = Array.isArray(rows) ? rows : [];
    const visitMap = visitsByClue || {};
    const maxVisitCount = list.reduce((max, item) => {
      const count = Array.isArray(visitMap[item && item.id]) ? visitMap[item.id].length : 0;
      return Math.max(max, count);
    }, 0);
    return list.map((item) => {
      const regDoctor = item.regDoctor || item.doctor || '';
      const visitCells = [];
      const vlist = Array.isArray(visitMap[item && item.id]) ? visitMap[item.id] : [];
      for (let i = 0; i < maxVisitCount; i++) {
        const v = vlist[i];
        if (!v) {
          visitCells.push('');
          continue;
        }
        const ts = formatExportDateTime(v.time || '');
        const user = (v.user || '').toString().trim();
        const content = ((v.content || '') + '').replace(/[\r\n]+/g, ' ').trim();
        const parts = [];
        if (ts) parts.push(ts);
        if (user) parts.push(user);
        const head = parts.join(' ');
        visitCells.push(head ? (content ? `${head}：${content}` : head) : content);
      }
      return [
        item.id || '',
        formatExportDateTime(item.createTime || ''),
        formatExportDateTime(item.assignedAt || ''),
        item.taoRen || '',
        item.channel || '',
        item.name || '',
        item.gender || '',
        item.age || '',
        item.phone || '',
        item.wechat || '',
        item.doctor || '',
        regDoctor,
        getConsultForExport(item),
        item.intent || '',
        item.visitStatus || '',
        item.bookUser || '',
        item.book || '',
        formatExportDateTime(item.bookTime || ''),
        ...visitCells
      ];
    });
  }

  function buildPublicPoolExportHeaders(rows, visitsByClue) {
    const list = Array.isArray(rows) ? rows : [];
    const visitMap = visitsByClue || {};
    const maxVisitCount = list.reduce((max, item) => {
      const count = Array.isArray(visitMap[item && item.id]) ? visitMap[item.id].length : 0;
      return Math.max(max, count);
    }, 0);
    const baseHeaders = ['ID', '创建时间', '分配时间', '套电人员', '渠道', '姓名', '性别', '年龄', '电话', '微信', '意向专家', '挂号专家', '咨询人员', '意向', '回访状态', '预约人员', '预约', '挂号时间'];
    const visitHeaders = [];
    for (let i = 1; i <= maxVisitCount; i++) visitHeaders.push(`回访${i}`);
    return baseHeaders.concat(visitHeaders);
  }

  function buildPublicPoolExportWorkbook(rows, visitsByClue) {
    const mainHeaders = buildPublicPoolExportHeaders(rows, visitsByClue);
    const mainRows = buildPublicPoolExportRows(rows, visitsByClue);
    return {
      workbook: { sheets: [] },
      sheets: [
        { name: '话单筛选导出', headers: mainHeaders, rows: mainRows }
      ]
    };
  }

  return {
    formatExportDateTime,
    getConsultForExport,
    getExpiredReasonShortLabel,
    buildPublicPoolExportPayload,
    buildPublicPoolExportRows,
    buildPublicPoolExportHeaders,
    buildPublicPoolExportWorkbook,
    mergeVisitSummary
  };
}));
