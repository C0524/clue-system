function registerVisitRoutes(deps) {
  const app = deps.app;
  const query = deps.query;
  const execute = deps.execute;
  const addLog = deps.addLog;
  const nowStr = deps.nowStr;
  const authMiddleware = deps.authMiddleware;

  function formatMonthDay(dateLike) {
    const dt = new Date(dateLike);
    if (Number.isNaN(dt.getTime())) return '';
    return `${dt.getMonth() + 1}月${dt.getDate()}日`;
  }

  async function refreshVisitStatus(clueId) {
    try {
      const cntRows = await query('SELECT COUNT(*) as c FROM visits WHERE clueId = ?', [clueId]);
      const c = cntRows && cntRows[0] && cntRows[0].c ? parseInt(cntRows[0].c, 10) : 0;
      let vs = '';
      if (c <= 0) vs = '未回访';
      else if (c === 1) vs = '1访';
      else if (c === 2) vs = '2访';
      else if (c === 3) vs = '3访';
      else vs = '4访';
      await execute('UPDATE clues SET visitStatus = ? WHERE id = ?', [vs, clueId]);
    } catch (e) {
      console.warn('refreshVisitStatus failed', e && e.message ? e.message : e);
    }
  }

  app.post('/api/createVisit', authMiddleware, async (req, res) => {
    try {
      const body = req.body || {};
      const clueId = body.id || body.clueId;
      if (!clueId) return res.status(400).json({ code: 400, msg: '缺少 clueId' });
      const content = body.content || '';
      const r = await execute('INSERT INTO visits (clueId, time, user, content) VALUES (?, ?, ?, ?)', [clueId, nowStr(), req.user.username, content]);
      const insertId = r && r.insertId ? r.insertId : null;
      await addLog(req.user.username, `创建回访草稿：clue ${clueId} visit ${insertId}`);
      await refreshVisitStatus(clueId);
      return res.json({ code: 200, data: { id: insertId } });
    } catch (e) {
      console.error('createVisit error', e);
      return res.json({ code: 500, msg: '创建回访失败' });
    }
  });

  app.post('/api/updateVisit', authMiddleware, async (req, res) => {
    try {
      const body = req.body || {};
      const id = body.id;
      const content = body.content;
      if (!id) return res.status(400).json({ code: 400, msg: '缺少 visit id' });
      await execute('UPDATE visits SET content = ? WHERE id = ?', [content || '', id]);
      await addLog(req.user.username, `更新回访 ${id}`);
      return res.json({ code: 200 });
    } catch (e) {
      console.error('updateVisit error', e);
      return res.json({ code: 500, msg: '更新回访失败' });
    }
  });

  app.get('/api/revisitList', authMiddleware, async (req, res) => {
    try {
      let params = [];
      let baseSql = "SELECT clues.*, (SELECT user FROM visits WHERE clueId = clues.id ORDER BY time ASC LIMIT 1) AS firstVisitUser FROM clues WHERE book = '已预约' AND arrive = '已到诊'";
      if (req.user && req.user.role === '咨询') {
        baseSql += " AND COALESCE(assignedTo, '') = ?";
        params.push(req.user.username);
      }
      if (req.query && req.query.month && /^\d{4}-\d{2}$/.test(req.query.month)) {
        const parts = req.query.month.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (Number.isFinite(y) && Number.isFinite(m)) {
          const start = `${y}-${m < 10 ? '0' + m : m}-01 00:00:00`;
          const em = m === 12 ? `${y + 1}-01-01 00:00:00` : `${y}-${m + 1 < 10 ? '0' + (m + 1) : m + 1}-01 00:00:00`;
          baseSql += ' AND ((COALESCE(visitDate, createTime) >= ? AND COALESCE(visitDate, createTime) < ?) OR (createTime >= ? AND createTime < ?))';
          params.push(start, em, start, em);
        }
      }
      baseSql += ' ORDER BY createTime DESC';
      const rows = await query(baseSql, params);

      let countsSql = "SELECT COALESCE(revisitGroupId, id) as g, COUNT(*) as c FROM clues WHERE book = '已预约' AND arrive = '已到诊'";
      const countsParams = [];
      if (req.query && req.query.month && /^\d{4}-\d{2}$/.test(req.query.month)) {
        const parts = req.query.month.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (Number.isFinite(y) && Number.isFinite(m)) {
          const start = `${y}-${m < 10 ? '0' + m : m}-01 00:00:00`;
          const em = m === 12 ? `${y + 1}-01-01 00:00:00` : `${y}-${m + 1 < 10 ? '0' + (m + 1) : m + 1}-01 00:00:00`;
          countsSql += ' AND ((COALESCE(visitDate, createTime) >= ? AND COALESCE(visitDate, createTime) < ?) OR (createTime >= ? AND createTime < ?))';
          countsParams.push(start, em, start, em);
        }
      }
      countsSql += ' GROUP BY COALESCE(revisitGroupId, id)';
      const counts = await query(countsSql, countsParams);
      const countMap = {};
      for (const r of counts) countMap[r.g] = r.c;

      const childCountMap = {};
      try {
        const childRows = await query("SELECT parentClueId, COUNT(*) as c FROM clues WHERE parentClueId IS NOT NULL AND parentClueId <> '' GROUP BY parentClueId");
        for (const row of childRows || []) {
          if (row && row.parentClueId) childCountMap[String(row.parentClueId)] = Number(row.c) || 0;
        }
      } catch (e) {
        console.warn('build childCount map failed', e);
      }

      const out = rows.map((r) => {
        const key = r.revisitGroupId || r.id;
        return Object.assign({}, r, { revisitCount: countMap[key] || 1, childCount: childCountMap[String(r.id)] || 0 });
      });
      return res.json({ code: 200, data: out });
    } catch (e) {
      console.error('revisitList error', e);
      return res.json({ code: 500, msg: '查询失败' });
    }
  });

  app.get('/api/expertSchedule', authMiddleware, async (req, res) => {
    try {
      const month = req.query && req.query.month ? String(req.query.month) : '';
      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return res.json({ code: 400, msg: 'month 参数缺失或格式不正确（YYYY-MM）' });
      }
      const parts = month.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
        return res.json({ code: 400, msg: 'month 参数不合法' });
      }

      const start = `${y}-${m < 10 ? '0' + m : m}-01 00:00:00`;
      const end = m === 12 ? `${y + 1}-01-01 00:00:00` : `${y}-${m + 1 < 10 ? '0' + (m + 1) : m + 1}-01 00:00:00`;
      const doctorFilter = req.query && req.query.doctor ? String(req.query.doctor).trim() : '';
      const bookUserFilter = req.query && req.query.bookUser ? String(req.query.bookUser).trim() : '';

      let hasVisitTypeColumn = false;
      try {
        const vtCols = await query("SHOW COLUMNS FROM clues LIKE 'visitType'");
        hasVisitTypeColumn = Array.isArray(vtCols) && vtCols.length > 0;
      } catch (_) {
        hasVisitTypeColumn = false;
      }
      const visitTypeSelectExpr = hasVisitTypeColumn ? 'visitType' : 'NULL AS visitType';

      let sql =
        `SELECT id,name,phone,doctor,regDoctor,bookUser,book,bookTime,visitDate,createTime,${visitTypeSelectExpr},revisitGroupId,visitMode,assignedTo FROM clues WHERE book = '已预约' AND visitDate IS NOT NULL AND visitDate <> '' AND DATE(visitDate) >= DATE(?) AND DATE(visitDate) < DATE(?)`;
      const params = [start, end];
      if (doctorFilter) {
        sql += " AND (CASE WHEN COALESCE(regDoctor, '') <> '' THEN regDoctor ELSE doctor END) = ?";
        params.push(doctorFilter);
      }
      if (bookUserFilter) {
        sql += " AND COALESCE(bookUser, '') = ?";
        params.push(bookUserFilter);
      }
      sql += ' ORDER BY DATE(visitDate) ASC, visitDate ASC, id ASC';

      const rows = await query(sql, params);
      const doctorRows = await query('SELECT name FROM doctors ORDER BY id ASC, name ASC');

      const daysInMonth = new Date(y, m, 0).getDate();
      const dayHeaders = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(y, m - 1, d);
        const ws = ['日', '一', '二', '三', '四', '五', '六'];
        dayHeaders.push({ day: d, week: ws[dt.getDay()] });
      }

      const toDiagnosisType = (item) => {
        const vt = item && item.visitType ? String(item.visitType).trim() : '';
        if (vt) return vt;
        return item && item.revisitGroupId ? '复诊' : '初诊';
      };
      const toDoctorName = (item) => {
        const reg = item && item.regDoctor ? String(item.regDoctor).trim() : '';
        const doc = item && item.doctor ? String(item.doctor).trim() : '';
        return reg || doc || '未指定';
      };
      const toPeriod = (scheduleTime) => {
        const s = scheduleTime ? String(scheduleTime) : '';
        if (!s || s.indexOf(':') === -1) return '全天';
        const dt = new Date(s.replace(' ', 'T'));
        if (!Number.isFinite(dt.getTime())) return '全天';
        return dt.getHours() < 12 ? '上午' : '下午';
      };
      const toDay = (scheduleTime) => {
        const s = scheduleTime ? String(scheduleTime) : '';
        if (!s) return 0;
        const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m2) return parseInt(m2[3], 10);
        const dt = new Date(s.replace(' ', 'T'));
        if (!Number.isFinite(dt.getTime())) return 0;
        return dt.getDate();
      };

      const doctorOrder = [];
      const doctorSet = new Set();
      for (const dr of doctorRows || []) {
        const n = dr && dr.name ? String(dr.name).trim() : '';
        if (!n || doctorSet.has(n)) continue;
        doctorSet.add(n);
        doctorOrder.push(n);
      }
      for (const r of rows || []) {
        const n = toDoctorName(r);
        if (!n || doctorSet.has(n)) continue;
        doctorSet.add(n);
        doctorOrder.push(n);
      }
      if (doctorFilter && !doctorSet.has(doctorFilter)) {
        doctorOrder.push(doctorFilter);
      }

      const mkDayData = () => ({ initial: 0, revisit: 0, am: 0, pm: 0, allDay: 0, total: 0, entries: [] });
      const doctorsMap = {};
      for (const name of doctorOrder) {
        const days = [];
        for (let i = 1; i <= daysInMonth; i++) days.push(mkDayData());
        doctorsMap[name] = { name, days, total: 0, initialTotal: 0, revisitTotal: 0 };
      }
      const dailyTotals = new Array(daysInMonth).fill(0);
      const bookUserSet = new Set();

      for (const item of rows || []) {
        const scheduleTime = item && item.visitDate ? item.visitDate : '';
        const doctorName = toDoctorName(item);
        if (!doctorsMap[doctorName]) {
          const days = [];
          for (let i = 1; i <= daysInMonth; i++) days.push(mkDayData());
          doctorsMap[doctorName] = { name: doctorName, days, total: 0, initialTotal: 0, revisitTotal: 0 };
        }
        const dayNum = toDay(scheduleTime);
        if (!dayNum || dayNum < 1 || dayNum > daysInMonth) continue;
        const idx = dayNum - 1;
        const diag = toDiagnosisType(item);
        const period = toPeriod(scheduleTime);
        const dayCell = doctorsMap[doctorName].days[idx];
        if (diag === '复诊') {
          dayCell.revisit += 1;
          doctorsMap[doctorName].revisitTotal += 1;
        } else {
          dayCell.initial += 1;
          doctorsMap[doctorName].initialTotal += 1;
        }
        if (period === '上午') dayCell.am += 1;
        else if (period === '下午') dayCell.pm += 1;
        else dayCell.allDay += 1;
        dayCell.total += 1;
        doctorsMap[doctorName].total += 1;
        dailyTotals[idx] += 1;

        const bu = item && item.bookUser ? String(item.bookUser).trim() : '';
        if (bu) bookUserSet.add(bu);
        dayCell.entries.push({
          id: item.id,
          name: item.name || '',
          phone: item.phone || '',
          bookUser: bu,
          diagnosisType: diag,
          visitMode: item.visitMode || '',
          visitDate: scheduleTime || '',
          period,
        });
      }

      const doctors = doctorOrder.map((name) => doctorsMap[name] || { name, days: [], total: 0, initialTotal: 0, revisitTotal: 0 });
      const bookUsers = Array.from(bookUserSet).sort((a, b) => a.localeCompare(b));

      return res.json({
        code: 200,
        data: {
          month,
          days: dayHeaders,
          dailyTotals,
          doctors,
          doctorOptions: doctorOrder,
          bookUserOptions: bookUsers,
        },
      });
    } catch (e) {
      console.error('expertSchedule error', e);
      return res.json({ code: 500, msg: '查询失败' });
    }
  });

  app.post('/api/scheduleRevisit', authMiddleware, async (req, res) => {
    try {
      const body = req.body || {};
      const baseId = body.baseId;
      const doctor = body.doctor;
      const bookUser = body.bookUser;
      const visitMode = body.visitMode;
      const visitDate = body.visitDate;
      const regFee = body.regFee;
      if (!baseId || !doctor || !bookUser || !visitMode || !visitDate) return res.json({ code: 400, msg: '参数不完整' });

      const rows = await query("SELECT clues.*, (SELECT user FROM visits WHERE clueId = clues.id ORDER BY time ASC LIMIT 1) AS firstVisitUser FROM clues WHERE id = ?", [baseId]);
      const base = rows && rows[0];
      if (!base) return res.json({ code: 404, msg: '找不到原始线索' });

      const baseName = String(base.name || '').trim();
      const basePhone = String(base.phone || '').trim();
      if (baseName && basePhone && visitDate) {
        const dupRows = await query(
          "SELECT id, visitDate FROM clues WHERE name = ? AND phone = ? AND book = '已预约' AND visitDate IS NOT NULL AND visitDate <> '' AND DATE(visitDate) = DATE(?) ORDER BY id DESC LIMIT 1",
          [baseName, basePhone, visitDate]
        );
        if (dupRows && dupRows.length > 0) {
          const dup = dupRows[0];
          const md = formatMonthDay(dup.visitDate || visitDate);
          return res.json({
            code: 409,
            duplicateType: 'same_patient_same_day_revisit',
            duplicateId: dup.id,
            duplicateVisitDate: dup.visitDate,
            msg: `${md || '该日期'}已经有相同患者预约了复诊`,
          });
        }
      }

      const newId = Date.now() + Math.floor(Math.random() * 1000);
      const createTime = nowStr();
      const groupId = base.revisitGroupId || base.id;
      const sql =
        'INSERT INTO clues (id, taoRen, channel, name, gender, age, phone, wechat, doctor, regDoctor, department, content, intent, visitStatus, bookUser, book, arrive, medicineDay, cost, regFee, visitMode, visitDate, createTime, firstConsultTime, username, revisitGroupId, bookTime) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
      const params = [
        newId,
        base.taoRen || '',
        base.channel || '',
        base.name || '',
        base.gender || '',
        base.age || null,
        base.phone || '',
        base.wechat || '',
        doctor,
        doctor,
        base.department || '',
        base.content || '',
        base.intent || '',
        base.visitStatus || '',
        bookUser,
        '已预约',
        '未到诊',
        '',
        null,
        regFee !== undefined && regFee !== '' && regFee !== null ? Number(regFee) : null,
        visitMode,
        visitDate,
        createTime,
        null,
        req.user.username,
        groupId,
        createTime,
      ];
      await execute(sql, params);
      await addLog(req.user.username, `复诊预约：来源 ${baseId}，新 ${newId}`);
      return res.json({ code: 200, data: { id: newId } });
    } catch (e) {
      console.error('scheduleRevisit error', e);
      return res.json({ code: 500, msg: '安排失败' });
    }
  });

  app.get('/api/visit/:id', authMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      const rows = await query('SELECT time,user,content FROM visits WHERE clueId = ? ORDER BY time DESC', [id]);
      return res.json({ code: 200, data: rows });
    } catch (e) {
      console.error(e);
      return res.json({ code: 500, msg: '查询失败' });
    }
  });

  app.post('/api/saveVisit', authMiddleware, async (req, res) => {
    try {
      const body = req.body || {};
      const id = body.id;
      const content = body.content;
      await execute('INSERT INTO visits (clueId,time,user,content) VALUES (?,?,?,?)', [id, nowStr(), req.user.username, content]);
      await refreshVisitStatus(id);
      await addLog(req.user.username, '保存回访记录');
      return res.json({ code: 200 });
    } catch (e) {
      console.error(e);
      return res.json({ code: 500, msg: '保存失败' });
    }
  });

  app.post('/api/visit', authMiddleware, async (req, res) => {
    try {
      const body = req.body || {};
      const id = body.id;
      const content = body.content;
      await execute('INSERT INTO visits (clueId,time,user,content) VALUES (?,?,?,?)', [id, nowStr(), req.user.username, content]);
      await refreshVisitStatus(id);
      await addLog(req.user.username, '保存回访记录');
      return res.json({ code: 200 });
    } catch (e) {
      console.error(e);
      return res.json({ code: 500, msg: '保存失败' });
    }
  });
}

module.exports = {
  registerVisitRoutes,
};
