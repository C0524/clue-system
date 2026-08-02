function registerStatsRoutes(deps) {
  const app = deps.app;
  const query = deps.query;
  const nowStr = deps.nowStr;
  const authMiddleware = deps.authMiddleware;
  const ENABLE_DEBUG_ROUTES = deps.ENABLE_DEBUG_ROUTES;
  const ENABLE_STATS_DEBUG_LOG = process.env.ENABLE_STATS_DEBUG_LOG === '1';

  let _lastMedCountsLogTs = 0;
  let _lastTreatUnvisitedLogTs = 0;

  function buildConsultAssigneeExpr(clueAlias) {
    const c = clueAlias || 'clues';
    return `COALESCE(
      NULLIF(${c}.assignedTo, ''),
      NULLIF((CASE WHEN COALESCE(${c}.visitStatus, '') REGEXP '访' THEN (SELECT user FROM visits WHERE clueId = ${c}.id ORDER BY time ASC LIMIT 1) ELSE '' END), ''),
      NULLIF(${c}.bookUser, ''),
      NULLIF(${c}.intentOperator, ''),
      ''
    )`;
  }

  app.get('/api/stats/unvisited', authMiddleware, async (req, res) => {
    try {
      let sql = "SELECT COUNT(*) as c FROM clues WHERE (COALESCE(visitStatus,'') = '' OR visitStatus = '未回访') AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.clueId = clues.id)";
      let todaySql = "SELECT COUNT(*) as c FROM clues WHERE (COALESCE(visitStatus,'') = '' OR visitStatus = '未回访') AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.clueId = clues.id) AND DATE(createTime) = DATE(NOW())";
      if (req.user && req.user.role === '咨询') {
        sql += " AND COALESCE(assignedTo, '') = ?";
        todaySql += " AND COALESCE(assignedTo, '') = ?";
      }
      const params = (req.user && req.user.role === '咨询') ? [req.user.username] : [];
      const totalRows = await query(sql, params);
      const todayRows = await query(todaySql, params);
      const total = totalRows && totalRows[0] && totalRows[0].c ? totalRows[0].c : 0;
      const today = todayRows && todayRows[0] && todayRows[0].c ? todayRows[0].c : 0;
      res.json({ code: 200, data: { totalUnvisited: total, todayUnvisited: today } });
    } catch (e) {
      console.error('stats unvisited error', e);
      res.json({ code: 500, msg: '查询失败' });
    }
  });

  app.get('/api/statAll', authMiddleware, async (req, res) => {
    try {
      const debugLog =
        ENABLE_STATS_DEBUG_LOG ||
        (req.query && (req.query.debugLog === '1' || req.query.debug === '1'));
      const includeRevisit = req.query && (req.query.includeRevisit === '1' || req.query.includeRevisit === 'true');
      let cluesSql = 'SELECT * FROM clues';
      const cluesParams = [];
      if (!includeRevisit) {
        cluesSql += " WHERE COALESCE(revisitGroupId, '') = ''";
      } else {
        cluesSql += ' WHERE 1=1';
      }
      if (req.user && req.user.role === '咨询') {
        cluesSql += " AND COALESCE(assignedTo, '') = ?";
        cluesParams.push(req.user.username);
      }
      let clues = await query(cluesSql, cluesParams);
      
      let allCluesSql = `SELECT clues.*, ${buildConsultAssigneeExpr('clues')} AS consultOwner FROM clues`;
      const allCluesParams = [];
      if (req.user && req.user.role === '咨询') {
        allCluesSql += ` WHERE ${buildConsultAssigneeExpr('clues')} = ?`;
        allCluesParams.push(req.user.username);
      }
      let allClues = await query(allCluesSql, allCluesParams);
      const treatUnvisited = req.query && (req.query.treatUnvisited === '1' || req.query.treatUnvisited === 'true') && req.user && (req.user.role === '主管' || req.user.role === '超级管理员');
      const excludeAdminImported = req.query && (req.query.excludeAdminImported === '1' || req.query.excludeAdminImported === 'true') && req.user && (req.user.role === '主管' || req.user.role === '超级管理员');
      const isAdminImportedClue = (c) => {
        const username = c && c.username ? String(c.username).trim().toLowerCase() : '';
        return username === 'admin';
      };
      if (excludeAdminImported) {
        clues = clues.filter((c) => !isAdminImportedClue(c));
        allClues = allClues.filter((c) => !isAdminImportedClue(c));
      }
      const doctors = await query('SELECT * FROM doctors');
      let taoRenList = [];
      try {
        const distinct = Array.from(new Set(clues.map((c) => (c && c.taoRen ? ('' + c.taoRen).trim() : '')).filter(Boolean)));
        const byClues = distinct.map((n) => ({ name: n }));
        let usersList = [];
        try {
          usersList = await query("SELECT username,role FROM users WHERE role IN ('套电','咨询','医助','主管')");
        } catch (_) {
          usersList = [];
        }
        const combined = new Map();
        byClues.forEach((t) => {
          if (t && t.name) combined.set(t.name, t);
        });
        usersList.forEach((u) => {
          if (u && u.username) combined.set(u.username, { name: u.username, role: u.role || '' });
        });
        taoRenList = Array.from(combined.values());
        if (taoRenList.length === 0) {
          try {
            taoRenList = await query('SELECT * FROM taoren');
          } catch (_) {
            taoRenList = [];
          }
        }
      } catch (_) {
        try {
          taoRenList = await query('SELECT * FROM taoren');
        } catch (_) {
          taoRenList = [];
        }
      }

      const toTime = (val) => {
        const t = new Date(val).getTime();
        return Number.isFinite(t) ? t : 0;
      };
      const recTime = (c) => {
        return toTime(c && c.visitDate ? (('' + c.visitDate).indexOf(':') === -1 ? c.visitDate + ' 00:00:00' : c.visitDate) : c && c.createTime);
      };
      const td = new Date();
      td.setHours(0, 0, 0, 0);
      const tdTs = td.getTime();
      const monthParam = req.query && req.query.month ? '' + req.query.month : '';
      let mn;
      let monthEndTs;
      if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
        const parts = monthParam.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
          mn = new Date(y, m - 1, 1).getTime();
          monthEndTs = new Date(y, m, 1).getTime();
        }
      }
      if (!mn) {
        mn = new Date(td.getFullYear(), td.getMonth(), 1).getTime();
        monthEndTs = new Date(td.getFullYear(), td.getMonth() + 1, 1).getTime();
      }
      const TRANSITION_DATE = process.env.MEDICINE_DAY_TRANSITION || '2026-06-01';
      const transitionTs = new Date(TRANSITION_DATE + 'T00:00:00').getTime();
      let schemeForMonth = 'mixed';
      if (monthEndTs <= transitionTs) schemeForMonth = 'legacy';
      else if (mn >= transitionTs) schemeForMonth = 'new';
      const isValidIntent = (intent) => {
        return typeof intent === 'string' && intent.trim() !== '' && intent !== '无效';
      };
      const isRevisitRecord = (c) => {
        return (c.visitType && String(c.visitType) === '复诊') || (c.revisitGroupId && c.revisitGroupId !== '');
      };
      const EXCLUDED_OPERATE_CHANNELS = new Set(['医带患']);
      const isOperateChannelExcluded = (c) => {
        const ch = c && c.channel ? String(c.channel).trim() : '';
        return EXCLUDED_OPERATE_CHANNELS.has(ch);
      };
      const EXCLUDED_MONTH_GOAL_CHANNELS = new Set(['医带患', '导入']);
      const isMonthGoalChannelExcluded = (c) => {
        const ch = c && c.channel ? String(c.channel).trim() : '';
        return EXCLUDED_MONTH_GOAL_CHANNELS.has(ch);
      };
      const EXCLUDED_TODAY_CLUE_CHANNELS = new Set(['导入']);
      const isTodayClueChannelExcluded = (c) => {
        const ch = c && c.channel ? String(c.channel).trim() : '';
        return EXCLUDED_TODAY_CLUE_CHANNELS.has(ch);
      };
      const getIntentDoctor = (c) => (c && c.doctor ? String(c.doctor) : '');
      const getRegDoctor = (c) => {
        if (c && c.regDoctor && String(c.regDoctor).trim() !== '') return String(c.regDoctor).trim();
        return getIntentDoctor(c);
      };
      const isOnlineVisitMode = (mode) => {
        const m = mode ? String(mode).trim() : '';
        return m === '线上' || m === '抄方-线上';
      };
      const isOfflineVisitMode = (mode) => {
        const m = mode ? String(mode).trim() : '';
        return m === '线下' || m === '抄方-线下';
      };
      const getDiagnosisTypeForConsultStat = (c) => {
        const vt = c && c.visitType ? String(c.visitType).trim() : '';
        if (vt) return vt;
        return c && c.revisitGroupId ? '复诊' : '初诊';
      };
      const isConsultRevisitRecord = (c) => getDiagnosisTypeForConsultStat(c) === '复诊';
      const getConsultOwner = (c) => {
        if (!c) return '';
        return c.consultOwner ? String(c.consultOwner).trim() : '';
      };
      const isBookedInMonthByVisitDate = (c) => {
        if (!c || c.book !== '已预约' || !c.visitDate) return false;
        const t = toTime(('' + c.visitDate).indexOf(':') === -1 ? c.visitDate + ' 00:00:00' : c.visitDate);
        return t >= mn && t < monthEndTs;
      };
      const isConsumableMedicineDay = (val) => {
        if (val === null || typeof val === 'undefined') return false;
        const s = String(val).trim();
        if (!s) return false;
        return s !== '未开方' && s !== '未开药' && s !== '未支付';
      };
      const hasTreatmentFeeConsumption = (c) => {
        return (Number(c && c.treatmentFee) || 0) > 0;
      };
      const isPersonnelConsumer = (c) => {
        return isConsumableMedicineDay(c && c.medicineDay) || hasTreatmentFeeConsumption(c);
      };
      const isExcludedForPersonnelSales = (c) => {
        if (isOperateChannelExcluded(c)) return true;
        return c && c.medicineDay === '未支付';
      };

      if (treatUnvisited) {
        try {
          const wrap = (c) => {
            try {
              const t = toTime(c && (c.visitDate || c.createTime));
              if (t >= mn && t < monthEndTs) {
                const vs = c.visitStatus || '';
                if (vs.indexOf('访') === -1) {
                  const nc = Object.assign({}, c);
                  nc.visitStatus = '1访';
                  if (!isValidIntent(nc.intent)) nc.intent = '临时有效';
                  return nc;
                }
              }
            } catch (_) {}
            return c;
          };
          for (let i = 0; i < clues.length; i++) clues[i] = wrap(clues[i]);
          for (let i = 0; i < allClues.length; i++) allClues[i] = wrap(allClues[i]);
          if (debugLog) {
            try {
              const nowTs2 = Date.now();
              if (nowTs2 - _lastTreatUnvisitedLogTs > 30 * 1000) {
                console.log('statAll: applied treatUnvisited temporary stat flag for user', req.user && req.user.username);
                _lastTreatUnvisitedLogTs = nowTs2;
              }
            } catch (_) {}
          }
        } catch (e) {
          console.warn('statAll: treatUnvisited application failed', e);
        }
      }

      try {
        const normIds = clues.map((r) => r && r.id).filter(Boolean);
        const normAllIds = allClues.map((r) => r && r.id).filter(Boolean);
        const ids = Array.from(new Set(normIds.concat(normAllIds)));
        if (ids.length > 0) {
          const ph = ids.map(() => '?').join(',');
          const vcRows = await query(`SELECT clueId, COUNT(*) as c FROM visits WHERE clueId IN (${ph}) GROUP BY clueId`, ids);
          const vcMap = {};
          for (const v of vcRows || []) vcMap[String(v.clueId)] = Number(v.c) || 0;
          const applyNorm = (arr) => {
            for (const r of arr) {
              try {
                const cur = r && r.visitStatus ? '' + r.visitStatus : '';
                if (!/^\d+访$/.test(cur)) {
                  const cnt = vcMap[String(r.id)] || 0;
                  const intentFlag = isValidIntent(r && r.intent) ? 1 : 0;
                  const finalCnt = Math.max(cnt, intentFlag);
                  if (finalCnt <= 0) r.visitStatus = '未回访';
                  else if (finalCnt === 1) r.visitStatus = '1访';
                  else if (finalCnt === 2) r.visitStatus = '2访';
                  else if (finalCnt === 3) r.visitStatus = '3访';
                  else r.visitStatus = '4访';
                }
              } catch (_) {}
            }
          };
          applyNorm(clues);
          applyNorm(allClues);
        }
      } catch (e) {
        console.warn('normalize visitStatus for statAll failed', e);
      }

      const docStat = doctors.map((doc) => {
        const allIntent = clues.filter((c) => getIntentDoctor(c) === doc.name);
        const allRegFull = allClues.filter((c) => getRegDoctor(c) === doc.name);
        const todayAll = allIntent.filter((c) => toTime(c.createTime) >= tdTs && !isTodayClueChannelExcluded(c));
        const monthAll = allIntent.filter((c) => recTime(c) >= mn && recTime(c) < monthEndTs);
        const monthAllCreate = allIntent.filter((c) => toTime(c.createTime) >= mn && toTime(c.createTime) < monthEndTs);
        const monthValidCreate = monthAllCreate.filter((c) => isValidIntent(c.intent));
        const monthBookInitial = allRegFull.filter((c) => c.book === '已预约' && !isRevisitRecord(c) && (() => {
          if (!c || !c.visitDate) return false;
          const vt = toTime(('' + c.visitDate).indexOf(':') === -1 ? c.visitDate + ' 00:00:00' : c.visitDate);
          if (!(vt >= mn && vt < monthEndTs)) return false;
          const ct = toTime(c.createTime);
          return ct >= mn && ct < monthEndTs;
        })()).length;
        const monthBookRevisit = allRegFull.filter((c) => c.book === '已预约' && isRevisitRecord(c) && (() => {
          if (!c || !c.visitDate) return false;
          const vt = toTime(('' + c.visitDate).indexOf(':') === -1 ? c.visitDate + ' 00:00:00' : c.visitDate);
          if (!(vt >= mn && vt < monthEndTs)) return false;
          const ct = toTime(c.createTime);
          return ct >= mn && ct < monthEndTs;
        })()).length;
        const monthBookPrevInitial = allRegFull.filter((c) => c.book === '已预约' && !isRevisitRecord(c) && (() => {
          if (!c || !c.visitDate) return false;
          const vt = toTime(('' + c.visitDate).indexOf(':') === -1 ? c.visitDate + ' 00:00:00' : c.visitDate);
          if (!(vt >= mn && vt < monthEndTs)) return false;
          const ct = toTime(c.createTime);
          return !(ct >= mn && ct < monthEndTs);
        })()).length;
        const monthBookPrevRevisit = allRegFull.filter((c) => c.book === '已预约' && isRevisitRecord(c) && (() => {
          if (!c || !c.visitDate) return false;
          const vt = toTime(('' + c.visitDate).indexOf(':') === -1 ? c.visitDate + ' 00:00:00' : c.visitDate);
          if (!(vt >= mn && vt < monthEndTs)) return false;
          const ct = toTime(c.createTime);
          return !(ct >= mn && ct < monthEndTs);
        })()).length;
        const monthBookPrev = monthBookPrevInitial + monthBookPrevRevisit;
        const monthBook = monthBookInitial + monthBookRevisit + monthBookPrev;
        const monthTotal = monthAll.length;
        const monthValid = monthAll.filter((c) => isValidIntent(c.intent)).length;
        const monthBookedFromCreate = allRegFull.filter((c) => c.book === '已预约' && !isRevisitRecord(c) && toTime(c.createTime) >= mn && toTime(c.createTime) < monthEndTs).length;
        let monthScheme = 'mixed';
        if (monthEndTs <= transitionTs) monthScheme = 'legacy';
        else if (mn >= transitionTs) monthScheme = 'new';
        const legacyCats = ['小于7天', '7-14天', '15-21天', '21天以上'];
        const newCats = ['14天以下', '14-21天', '22-28天', '28天以上', '未开药', '未支付'];
        const monthMedCountsLegacy = {};
        const monthMedCountsNew = {};
        legacyCats.forEach((cn) => {
          monthMedCountsLegacy[cn] = 0;
        });
        newCats.forEach((cn) => {
          monthMedCountsNew[cn] = 0;
        });
        allRegFull.forEach((x) => {
          try {
            const t = recTime(x);
            if (!(t >= mn && t < monthEndTs)) return;
            const md = x.medicineDay;
            if (typeof md === 'string' && legacyCats.indexOf(md) >= 0) monthMedCountsLegacy[md]++;
            if (typeof md === 'string' && newCats.indexOf(md) >= 0) {
              monthMedCountsNew[md]++;
            } else if (md === null || typeof md === 'undefined' || (typeof md === 'string' && ('' + md).trim() === '')) {
              monthMedCountsNew['未开药']++;
            } else {
              const n = Number(md);
              if (Number.isFinite(n)) {
                if (n < 14) monthMedCountsNew['14天以下']++;
                else if (n >= 14 && n <= 21) monthMedCountsNew['14-21天']++;
                else if (n >= 22 && n <= 28) monthMedCountsNew['22-28天']++;
                else if (n > 28) monthMedCountsNew['28天以上']++;
              }
            }
          } catch (_) {}
        });
        const monthMedCounts = monthScheme === 'legacy' ? monthMedCountsLegacy : monthMedCountsNew;
        const monthInitialCost = allRegFull.filter((x) => x.book === '已预约' && !isRevisitRecord(x) && (() => {
          const t = recTime(x);
          return t >= mn && t < monthEndTs;
        })()).reduce((s, x) => {
          const noDrug = (x.medicineDay === '未开药' || x.medicineDay === '未支付') && (x.arrive === '已到诊' || x.arrive === '已到院');
          return s + (noDrug ? 0 : Number(x.cost) || 0);
        }, 0);
        const monthRevisitCost = allRegFull.filter((x) => x.book === '已预约' && isRevisitRecord(x) && (() => {
          const t = recTime(x);
          return t >= mn && t < monthEndTs;
        })()).reduce((s, x) => {
          const noDrug = (x.medicineDay === '未开药' || x.medicineDay === '未支付') && (x.arrive === '已到诊' || x.arrive === '已到院');
          return s + (noDrug ? 0 : Number(x.cost) || 0);
        }, 0);
        const monthTotalCost = monthInitialCost + monthRevisitCost;

        return {
          name: doc.name,
          todayTotal: todayAll.length,
          todayValid: todayAll.filter((c) => isValidIntent(c.intent)).length,
          monthTotal,
          monthValid,
          monthBookInitial,
          monthBookRevisit,
          monthBook,
          monthBookPrevInitial,
          monthBookPrevRevisit,
          monthBookPrev,
          monthNoPrescriptionOrNoPay: allRegFull.filter((x) => (x.medicineDay === '未开药' || x.medicineDay === '未支付') && recTime(x) >= mn && recTime(x) < monthEndTs).length,
          monthNoPrescription: allRegFull.filter((x) => x.medicineDay === '未开药' && recTime(x) >= mn && recTime(x) < monthEndTs).length,
          monthNoPay: allRegFull.filter((x) => x.medicineDay === '未支付' && recTime(x) >= mn && recTime(x) < monthEndTs).length,
          monthBookRate: monthValidCreate.length ? ((monthBookedFromCreate / monthValidCreate.length) * 100).toFixed(1) + '%' : '0%',
          monthZhuanWei: monthAll.filter((c) => c.intent === '已加微').length,
          monthArrive: allRegFull.filter((c) => (c.arrive === '已到诊' || c.arrive === '已到院') && recTime(c) >= mn && recTime(c) < monthEndTs).length,
          monthArriveRate: (function () {
            const ma = allRegFull.filter((c) => (c.arrive === '已到诊' || c.arrive === '已到院') && recTime(c) >= mn && recTime(c) < monthEndTs).length;
            return monthBook > 0 ? ((ma / monthBook) * 100).toFixed(1) + '%' : '0%';
          })(),
          monthOnlineArrive: allRegFull.filter((c) => (c.arrive === '已到诊' || c.arrive === '已到院') && isOnlineVisitMode(c.visitMode) && recTime(c) >= mn && recTime(c) < monthEndTs).length,
          monthOfflineArrive: allRegFull.filter((c) => (c.arrive === '已到诊' || c.arrive === '已到院') && isOfflineVisitMode(c.visitMode) && recTime(c) >= mn && recTime(c) < monthEndTs).length,
          medicineDayCounts: monthMedCounts,
          monthInitialCost,
          monthRevisitCost,
          monthTotalCost,
        };
      });

      const docMonthBookMap = {};
      for (const it of docStat || []) {
        if (it && it.name) docMonthBookMap[it.name] = Number(it.monthBook) || 0;
      }

      const drugCostStat = doctors.map((doc) => {
        const allFull = allClues.filter((c) => getRegDoctor(c) === doc.name);
        const monthAllFull = allFull.filter((c) => recTime(c) >= mn && recTime(c) < monthEndTs);
        const monthBook = Number(docMonthBookMap[doc.name]) || 0;
        const monthBookedRows = monthAllFull.filter((c) => c.book === '已预约');
        const monthInitialBook = monthBookedRows.filter((c) => !isRevisitRecord(c)).length;
        const monthRevisitBook = monthBookedRows.filter((c) => isRevisitRecord(c)).length;
        const monthArrivedRows = monthAllFull.filter((c) => c.arrive === '已到诊' || c.arrive === '已到院');
        const monthInitialArrive = monthArrivedRows.filter((c) => !isRevisitRecord(c)).length;
        const monthRevisitArrive = monthArrivedRows.filter((c) => isRevisitRecord(c)).length;
        const monthArrive = monthArrivedRows.length;
        const monthWaitInitial = Math.max(0, monthInitialBook - monthInitialArrive);
        const monthWaitRevisit = Math.max(0, monthRevisitBook - monthRevisitArrive);
        const monthWaitTotal = monthWaitInitial + monthWaitRevisit;
        const monthNoPrescriptionOrNoPay = monthArrivedRows.filter((c) => c.medicineDay === '未开药' || c.medicineDay === '未支付').length;
        const monthNoPrescription = monthArrivedRows.filter((c) => c.medicineDay === '未开药').length;
        const monthNoPay = monthArrivedRows.filter((c) => c.medicineDay === '未支付').length;
        const initialRefundAmount = monthBookedRows.filter((c) => !isRevisitRecord(c)).reduce((s, x) => s + (Number(x.refundAmount) || 0), 0);
        const revisitRefundAmount = monthBookedRows.filter((c) => isRevisitRecord(c)).reduce((s, x) => s + (Number(x.refundAmount) || 0), 0);
        const refundAmount = initialRefundAmount + revisitRefundAmount;
        const refundCount = monthBookedRows.filter((c) => (Number(c.refundAmount) || 0) > 0).length;

        const initialRawCost = monthAllFull.filter((c) => c.book === '已预约' && !isRevisitRecord(c) && (() => {
          const t = recTime(c);
          return t >= mn && t < monthEndTs;
        })()).reduce((s, x) => {
          const noDrug = (x.medicineDay === '未开药' || x.medicineDay === '未支付') && (x.arrive === '已到诊' || x.arrive === '已到院');
          return s + (noDrug ? 0 : Number(x.cost) || 0);
        }, 0);
        const revisitRawCost = monthAllFull.filter((c) => c.book === '已预约' && isRevisitRecord(c) && (() => {
          const t = recTime(c);
          return t >= mn && t < monthEndTs;
        })()).reduce((s, x) => {
          const noDrug = (x.medicineDay === '未开药' || x.medicineDay === '未支付') && (x.arrive === '已到诊' || x.arrive === '已到院');
          return s + (noDrug ? 0 : Number(x.cost) || 0);
        }, 0);
        const initialCost = initialRawCost - initialRefundAmount;
        const revisitCost = revisitRawCost - revisitRefundAmount;
        const totalCost = initialCost + revisitCost;
        const onlineRawCost = monthAllFull.filter((c) => c.book === '已预约' && isOnlineVisitMode(c.visitMode) && (() => {
          const t = recTime(c);
          return t >= mn && t < monthEndTs;
        })()).reduce((s, x) => {
          const noDrug = (x.medicineDay === '未开药' || x.medicineDay === '未支付') && (x.arrive === '已到诊' || x.arrive === '已到院');
          return s + (noDrug ? 0 : Number(x.cost) || 0);
        }, 0);
        const offlineRawCost = monthAllFull.filter((c) => c.book === '已预约' && isOfflineVisitMode(c.visitMode) && (() => {
          const t = recTime(c);
          return t >= mn && t < monthEndTs;
        })()).reduce((s, x) => {
          const noDrug = (x.medicineDay === '未开药' || x.medicineDay === '未支付') && (x.arrive === '已到诊' || x.arrive === '已到院');
          return s + (noDrug ? 0 : Number(x.cost) || 0);
        }, 0);
        const onlineRefundAmount = monthBookedRows.filter((c) => isOnlineVisitMode(c.visitMode)).reduce((s, x) => s + (Number(x.refundAmount) || 0), 0);
        const offlineRefundAmount = monthBookedRows.filter((c) => isOfflineVisitMode(c.visitMode)).reduce((s, x) => s + (Number(x.refundAmount) || 0), 0);
        const onlineCost = onlineRawCost - onlineRefundAmount;
        const offlineCost = offlineRawCost - offlineRefundAmount;
        const initialRegFee = monthAllFull.filter((c) => c.book === '已预约' && !isRevisitRecord(c) && (() => {
          const t = recTime(c);
          return t >= mn && t < monthEndTs;
        })()).reduce((s, x) => s + (Number(x.regFee) || 0), 0);
        const revisitRegFee = monthAllFull.filter((c) => c.book === '已预约' && isRevisitRecord(c) && (() => {
          const t = recTime(c);
          return t >= mn && t < monthEndTs;
        })()).reduce((s, x) => s + (Number(x.regFee) || 0), 0);
        const totalRegFee = initialRegFee + revisitRegFee;
        const initialTreatmentFee = monthAllFull.filter((c) => c.book === '已预约' && !isRevisitRecord(c) && (() => {
          const t = recTime(c);
          return t >= mn && t < monthEndTs;
        })()).reduce((s, x) => s + (Number(x.treatmentFee) || 0), 0);
        const revisitTreatmentFee = monthAllFull.filter((c) => c.book === '已预约' && isRevisitRecord(c) && (() => {
          const t = recTime(c);
          return t >= mn && t < monthEndTs;
        })()).reduce((s, x) => s + (Number(x.treatmentFee) || 0), 0);
        const totalTreatmentFee = initialTreatmentFee + revisitTreatmentFee;
        const hasValidCostForDrugTaken = (c) => {
          const raw = c && c.cost;
          if (raw === null || typeof raw === 'undefined') return false;
          const s = String(raw).trim();
          if (!s) return false;
          const n = Number(raw);
          if (!Number.isFinite(n)) return false;
          return n !== 0;
        };
        const monthInitialDrugTaken = monthArrivedRows.filter((c) => !isRevisitRecord(c) && hasValidCostForDrugTaken(c)).length;
        const monthRevisitDrugTaken = monthArrivedRows.filter((c) => isRevisitRecord(c) && hasValidCostForDrugTaken(c)).length;
        const drugTakenCount = monthInitialDrugTaken + monthRevisitDrugTaken;
        const dealRate = monthArrive > 0 ? ((drugTakenCount / monthArrive) * 100).toFixed(1) + '%' : '0%';
        const monthInitialDealRate = monthInitialArrive > 0 ? ((monthInitialDrugTaken / monthInitialArrive) * 100).toFixed(1) + '%' : '0%';
        const monthRevisitDealRate = monthRevisitArrive > 0 ? ((monthRevisitDrugTaken / monthRevisitArrive) * 100).toFixed(1) + '%' : '0%';
        const initialUnitCost = monthInitialArrive > 0 ? Number((initialCost / monthInitialArrive).toFixed(2)) : 0;
        const revisitUnitCost = monthRevisitArrive > 0 ? Number((revisitCost / monthRevisitArrive).toFixed(2)) : 0;
        const totalUnitCost = monthArrive > 0 ? Number((totalCost / monthArrive).toFixed(2)) : 0;
        const initialPrescriptionAvgCost = monthInitialDrugTaken > 0 ? Number((initialCost / monthInitialDrugTaken).toFixed(2)) : 0;
        const revisitPrescriptionAvgCost = monthRevisitDrugTaken > 0 ? Number((revisitCost / monthRevisitDrugTaken).toFixed(2)) : 0;
        const totalPrescriptionAvgCost = drugTakenCount > 0 ? Number((totalCost / drugTakenCount).toFixed(2)) : 0;
        return {
          name: doc.name,
          monthInitialBook,
          monthRevisitBook,
          monthInitialArrive,
          monthRevisitArrive,
          monthWaitInitial,
          monthWaitRevisit,
          monthWaitTotal,
          monthBook,
          monthArrive,
          monthArriveRate: monthBook > 0 ? ((monthArrive / monthBook) * 100).toFixed(1) + '%' : '0%',
          monthNoPrescriptionOrNoPay,
          monthNoPrescription,
          monthNoPay,
          monthInitialDrugTaken,
          monthRevisitDrugTaken,
          refundCount,
          refundAmount,
          initialCost,
          revisitCost,
          totalCost,
          drugTakenCount,
          dealRate,
          monthInitialDealRate,
          monthRevisitDealRate,
          initialUnitCost,
          revisitUnitCost,
          totalUnitCost,
          initialPrescriptionAvgCost,
          revisitPrescriptionAvgCost,
          totalPrescriptionAvgCost,
          onlineCost,
          offlineCost,
          initialRegFee,
          revisitRegFee,
          totalRegFee,
          initialTreatmentFee,
          revisitTreatmentFee,
          totalTreatmentFee,
        };
      });

      if (debugLog) {
        try {
          const totalCounts = {};
          for (const it of drugCostStat) {
            const counts = it.medicineCounts || {};
            for (const k of Object.keys(counts)) {
              totalCounts[k] = (totalCounts[k] || 0) + (Number(counts[k]) || 0);
            }
          }
          const nowTs = Date.now();
          if (nowTs - _lastMedCountsLogTs > 30 * 1000) {
            console.log('statAll debug totals for medicineCounts:', JSON.stringify(totalCounts));
            _lastMedCountsLogTs = nowTs;
          }
        } catch (e) {
          console.warn('statAll debug totals failed', e);
        }
      }

      const taoStat = taoRenList.map((tao) => {
        const all = clues.filter((c) => c.taoRen === tao.name);
        const t = all.filter((c) => toTime(c.createTime) >= tdTs && !isTodayClueChannelExcluded(c));
        const m = all.filter((c) => toTime(c.createTime) >= mn && toTime(c.createTime) < monthEndTs);
        return {
          name: tao.name,
          todayTotal: t.length,
          todayValid: t.filter((c) => isValidIntent(c.intent)).length,
          monthTotal: m.length,
          monthValid: m.filter((c) => isValidIntent(c.intent)).length,
        };
      });

      let bookStatSource = allClues;
      if (req.user && req.user.role === '咨询') {
        try {
          const extraByBookUser = await query("SELECT * FROM clues WHERE COALESCE(bookUser, '') = ?", [req.user.username]);
          const merged = new Map();
          for (const r of allClues || []) merged.set(String(r.id), r);
          for (const r of extraByBookUser || []) merged.set(String(r.id), r);
          bookStatSource = Array.from(merged.values());
        } catch (_) {
          bookStatSource = allClues;
        }
      }
      const bookUsersSet = new Set(bookStatSource.filter((c) => c.bookUser).map((c) => c.bookUser));
      taoRenList.forEach((t) => bookUsersSet.add(t.name));
      if (bookStatSource.some((c) => !c.bookUser)) bookUsersSet.add('未分配');
      const bookUserStat = {};
      for (const name of [...bookUsersSet]) {
        const self = bookStatSource.filter((c) => (name === '未分配' ? !c.bookUser : c.bookUser === name));
        const todayBookedRows = self.filter((c) => toTime(c.createTime) >= tdTs && c.book === '已预约');
        const todayBookInitialCount = todayBookedRows.filter((c) => !isConsultRevisitRecord(c)).length;
        const todayBookRevisitCount = todayBookedRows.filter((c) => isConsultRevisitRecord(c)).length;
        const monthBookedRows = self.filter((c) => isBookedInMonthByVisitDate(c) && !isOperateChannelExcluded(c));
        const monthBookCount = monthBookedRows.length;
        const monthBookInitialCount = monthBookedRows.filter((c) => !isConsultRevisitRecord(c)).length;
        const monthBookRevisitCount = monthBookedRows.filter((c) => isConsultRevisitRecord(c)).length;
        const monthConsumerRows = monthBookedRows.filter((c) => isPersonnelConsumer(c));
        const monthConsumerCount = monthConsumerRows.length;
        const monthBaseSales = monthBookedRows
          .filter((c) => !isExcludedForPersonnelSales(c))
          .reduce((sum, c) => sum + (Number(c.cost) || 0), 0);
        const monthConsumerTreatmentFee = monthConsumerRows.reduce((sum, c) => sum + (Number(c.treatmentFee) || 0), 0);
        const monthSales = monthBaseSales + monthConsumerTreatmentFee;
        const monthUnitSales = monthBookCount > 0 ? Number((monthSales / monthBookCount).toFixed(2)) : 0;
        const monthDealRate = monthBookCount > 0 ? Number(((monthConsumerCount / monthBookCount) * 100).toFixed(1)) : 0;
        bookUserStat[name] = {
          name,
          todayBook: todayBookedRows.length,
          todayBookInitialCount,
          todayBookRevisitCount,
          monthBookCount,
          monthBookInitialCount,
          monthBookRevisitCount,
          monthConsumerCount,
          monthConsumerTreatmentFee,
          monthSales,
          monthUnitSales,
          monthDealRate,
        };
      }

      const personnelStat = taoRenList.map((t) => {
        const role = t && t.role ? String(t.role).trim() : '';
        const isConsultRole = role === '咨询' || role === '主管' || role === '医助';
        const personName = t && t.name ? String(t.name).trim() : '';
        const all = isConsultRole
          ? allClues.filter((c) => getConsultOwner(c) === personName && (!c.revisitGroupId || String(c.revisitGroupId).trim() === ''))
          : clues.filter((c) => c.taoRen === t.name);
        const todayAll = all.filter((c) => toTime(c.createTime) >= tdTs && !isTodayClueChannelExcluded(c));
        const monthAll = all.filter((c) => toTime(c.createTime) >= mn && toTime(c.createTime) < monthEndTs);
        const monthAssignedRows = isConsultRole
          ? all.filter((c) => {
              const ct = toTime(c.createTime);
              const at = toTime(c.assignedAt);
              return ct >= mn && ct < monthEndTs && at >= mn && at < monthEndTs;
            })
          : [];
        const monthAssigned = monthAssignedRows.length;
        const monthTotalCombined = monthAll.length;
        const monthEffective = monthAll.filter((c) => isValidIntent(c.intent)).length;
        const monthZhuanWei = monthAll.filter((c) => c.intent === '已加微').length;
        const monthZhuanWeiRate = monthEffective > 0 ? Number(((monthZhuanWei / monthEffective) * 100).toFixed(1)) : 0;
        const b = bookUserStat[t.name] || {};
        // 咨询统计口径：当月初诊预约=创建时间在当月且挂号时间(bookTime)在当月的初诊已预约线索
        const monthBookInitial = all.filter((c) => {
          if (!c || c.book !== '已预约') return false;
          if (isConsultRevisitRecord(c)) return false;
          const createTs = toTime(c.createTime);
          if (!(createTs >= mn && createTs < monthEndTs)) return false;
          if (!c.bookTime) return false;
          const bookTs = toTime(('' + c.bookTime).indexOf(':') === -1 ? c.bookTime + ' 00:00:00' : c.bookTime);
          return bookTs >= mn && bookTs < monthEndTs;
        }).length;
        const monthBookRevisit = Number(b.monthBookRevisitCount) || 0;
        const monthBookTotal = monthBookInitial + monthBookRevisit;
        const monthBookRate = monthEffective > 0 ? Number(((monthBookInitial / monthEffective) * 100).toFixed(1)) : 0;
        return {
          name: t.name,
          role,
          todayTotal: todayAll.length,
          todayValid: todayAll.filter((c) => isValidIntent(c.intent)).length,
          monthTotal: monthAll.length,
          monthValid: monthAll.filter((c) => isValidIntent(c.intent)).length,
          monthAssigned,
          monthTotalCombined,
          monthEffective,
          monthZhuanWei,
          monthZhuanWeiRate,
          todayBook: Number(b.todayBook) || 0,
          todayBookInitial: Number(b.todayBookInitialCount) || 0,
          todayBookRevisit: Number(b.todayBookRevisitCount) || 0,
          monthBook: Number(b.monthBookCount) || 0,
          monthBookInitial,
          monthBookRevisit,
          monthBookTotal,
          monthBookRate,
          monthConsumerCount: Number(b.monthConsumerCount) || 0,
          monthConsumerTreatmentFee: Number(b.monthConsumerTreatmentFee) || 0,
          monthSales: Number(b.monthSales) || 0,
          monthUnitSales: Number(b.monthUnitSales) || 0,
          monthDealRate: Number(b.monthDealRate) || 0,
        };
      });

      const taoSetToday = new Set();
      const taoSetTodayValid = new Set();
      const taoSetMonth = new Set();
      const taoSetMonthValid = new Set();
      const bookSetToday = new Set();
      const bookSetTodayInitial = new Set();
      const bookSetTodayRevisit = new Set();
      const bookSetMonth = new Set();
      const bookSetMonthInitial = new Set();
      const bookSetMonthRevisit = new Set();
      const bookSetMonthConsumers = new Set();
      let monthSalesTotal = 0;
      let monthConsumerTreatmentFeeTotal = 0;

      for (const c of clues) {
        const id = String(c.id);
        const ct = toTime(c.createTime);
        if (c.taoRen) {
          if (ct >= tdTs && !isTodayClueChannelExcluded(c)) {
            taoSetToday.add(id);
            if (isValidIntent(c.intent)) taoSetTodayValid.add(id);
          }
          if (ct >= mn && ct < monthEndTs) {
            taoSetMonth.add(id);
            if (isValidIntent(c.intent)) taoSetMonthValid.add(id);
          }
        }
      }
      for (const c of bookStatSource) {
        if (!c.bookUser) continue;
        const id = String(c.id);
        const ct = toTime(c.createTime);
        if (ct >= tdTs && c.book === '已预约') {
          bookSetToday.add(id);
          if (isConsultRevisitRecord(c)) bookSetTodayRevisit.add(id);
          else bookSetTodayInitial.add(id);
        }
        if (isBookedInMonthByVisitDate(c)) {
          if (isOperateChannelExcluded(c)) continue;
          bookSetMonth.add(id);
          if (isConsultRevisitRecord(c)) bookSetMonthRevisit.add(id);
          else bookSetMonthInitial.add(id);
          if (!isExcludedForPersonnelSales(c)) monthSalesTotal += Number(c.cost) || 0;
          if (isPersonnelConsumer(c)) {
            bookSetMonthConsumers.add(id);
            monthConsumerTreatmentFeeTotal += Number(c.treatmentFee) || 0;
          }
        }
      }
      monthSalesTotal += monthConsumerTreatmentFeeTotal;
      const totalMonthBook = bookSetMonth.size;
      const totalMonthConsumers = bookSetMonthConsumers.size;
      const totalMonthUnitSales = totalMonthBook > 0 ? Number((monthSalesTotal / totalMonthBook).toFixed(2)) : 0;
      const totalMonthDealRate = totalMonthBook > 0 ? Number(((totalMonthConsumers / totalMonthBook) * 100).toFixed(1)) : 0;
      const personnelTotals = {
        taoTotals: {
          todayTotal: taoSetToday.size,
          todayValid: taoSetTodayValid.size,
          monthTotal: taoSetMonth.size,
          monthValid: taoSetMonthValid.size,
        },
        bookTotals: {
          todayBook: bookSetToday.size,
          todayBookInitial: bookSetTodayInitial.size,
          todayBookRevisit: bookSetTodayRevisit.size,
          monthBook: totalMonthBook,
          monthBookInitial: bookSetMonthInitial.size,
          monthBookRevisit: bookSetMonthRevisit.size,
          monthConsumerCount: totalMonthConsumers,
          monthSales: monthSalesTotal,
          monthUnitSales: totalMonthUnitSales,
          monthDealRate: totalMonthDealRate,
        },
      };

      const channelTodayTotal = {};
      const channelTodayValid = {};
      const channelMonthValid = {};
      for (const c of clues) {
        const ch = c.channel && ('' + c.channel).trim() ? '' + c.channel : '未指定';
        const ct = toTime(c.createTime);
        if (c.taoRen) {
          if (ct >= tdTs && !isTodayClueChannelExcluded(c)) {
            channelTodayTotal[ch] = (channelTodayTotal[ch] || 0) + 1;
            if (isValidIntent(c.intent)) channelTodayValid[ch] = (channelTodayValid[ch] || 0) + 1;
          }
          const rtime = recTime(c);
          if (rtime >= mn && rtime < monthEndTs) {
            if (isValidIntent(c.intent)) channelMonthValid[ch] = (channelMonthValid[ch] || 0) + 1;
          }
        }
      }
      const personnelChannelBreakdown = { todayTotal: channelTodayTotal, todayValid: channelTodayValid, monthValid: channelMonthValid };

      const BASE_MONTH_GOAL_TARGETS = [200, 300, 500, 800, 1000];
      const monthKeyFromTs = (ts) => {
        const d = new Date(ts);
        if (!Number.isFinite(d.getTime())) return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      };
      const monthRank = (mk) => {
        const p = (mk || '').split('-');
        if (p.length !== 2) return -1;
        const yy = parseInt(p[0], 10);
        const mm = parseInt(p[1], 10);
        if (!Number.isFinite(yy) || !Number.isFinite(mm)) return -1;
        return yy * 12 + (mm - 1);
      };
      const selectedMonthKey = `${new Date(mn).getFullYear()}-${String(new Date(mn).getMonth() + 1).padStart(2, '0')}`;
      const selectedMonthRank = monthRank(selectedMonthKey);

      const monthGoalHistoryByDoctor = {};
      for (const c of clues) {
        const docName = getIntentDoctor(c);
        if (!docName) continue;
        if (isRevisitRecord(c)) continue;
        if (!isValidIntent(c.intent)) continue;
        if (isMonthGoalChannelExcluded(c)) continue;
        const ct = toTime(c.createTime);
        if (!ct) continue;
        const mk = monthKeyFromTs(ct);
        if (!mk) continue;
        if (!monthGoalHistoryByDoctor[docName]) monthGoalHistoryByDoctor[docName] = {};
        monthGoalHistoryByDoctor[docName][mk] = (monthGoalHistoryByDoctor[docName][mk] || 0) + 1;
      }

      const getMonthGoalTierLevelForSelectedMonth = (docName) => {
        const hist = monthGoalHistoryByDoctor[docName] || {};
        const monthKeys = Object.keys(hist).sort((a, b) => monthRank(a) - monthRank(b));
        let level = 0;
        for (const mk of monthKeys) {
          const r = monthRank(mk);
          if (r < 0 || r >= selectedMonthRank) continue;
          const currentTierTarget = BASE_MONTH_GOAL_TARGETS[Math.min(level, BASE_MONTH_GOAL_TARGETS.length - 1)];
          if ((Number(hist[mk]) || 0) >= currentTierTarget && level < BASE_MONTH_GOAL_TARGETS.length - 1) {
            level += 1;
          }
        }
        return level;
      };

      const monthGoalStat = doctors.map((doc) => {
        const todayAll = clues.filter((c) => getIntentDoctor(c) === doc.name && toTime(c.createTime) >= tdTs && !isRevisitRecord(c) && !isTodayClueChannelExcluded(c));
        const todayValid = todayAll.filter((c) => isValidIntent(c.intent));
        const monthAllCreate = clues.filter((c) => getIntentDoctor(c) === doc.name && toTime(c.createTime) >= mn && toTime(c.createTime) < monthEndTs && !isRevisitRecord(c));
        const monthValidCreate = monthAllCreate.filter((c) => isValidIntent(c.intent));
        const monthZhuanWei = monthValidCreate.filter((c) => c.intent === '已加微').length;
        const validRate = monthValidCreate.length > 0 ? ((monthValidCreate.length / monthAllCreate.length) * 100).toFixed(1) + '%' : '0%';
        const monthByRecTime = clues.filter((c) => getRegDoctor(c) === doc.name && recTime(c) >= mn && recTime(c) < monthEndTs);
        const monthBookInitial = monthByRecTime.filter((c) => c.book === '已预约' && !isRevisitRecord(c)).length;
        const monthBookRevisit = monthByRecTime.filter((c) => c.book === '已预约' && isRevisitRecord(c)).length;
        const monthBookPrevInitial = 0;
        const monthBookPrevRevisit = 0;
        const monthBookPrev = monthBookPrevInitial + monthBookPrevRevisit;
        const monthBook = monthBookInitial + monthBookRevisit;
        const monthBookedFromCreate = clues.filter((c) => getRegDoctor(c) === doc.name && c.book === '已预约' && !isRevisitRecord(c) && toTime(c.createTime) >= mn && toTime(c.createTime) < monthEndTs).length;
        const bookUsers = new Set(monthByRecTime.filter((c) => c.bookUser).map((c) => c.bookUser));
        const monthBookUserCount = bookUsers.size;
        const bookRate = monthValidCreate.length > 0 ? ((monthBookedFromCreate / monthValidCreate.length) * 100).toFixed(1) + '%' : '0%';
        const monthOnlineArrive = monthByRecTime.filter((c) => (c.arrive === '已到诊' || c.arrive === '已到院') && isOnlineVisitMode(c.visitMode)).length;
        const monthOfflineArrive = monthByRecTime.filter((c) => (c.arrive === '已到诊' || c.arrive === '已到院') && isOfflineVisitMode(c.visitMode)).length;
        const monthArriveBase = clues.filter((c) => {
          if (getRegDoctor(c) !== doc.name) return false;
          if (!c || !c.visitDate) return false;
          const vt = toTime(('' + c.visitDate).indexOf(':') === -1 ? c.visitDate + ' 00:00:00' : c.visitDate);
          return vt >= mn && vt < monthEndTs;
        });
        const monthArrive = monthArriveBase.filter((c) => {
          if (isMonthGoalChannelExcluded(c)) return false;
          if (isRevisitRecord(c)) return false;
          return c.arrive === '已到诊' || c.arrive === '已到院';
        }).length;

        let operator = doc && doc.operator ? doc.operator : '';
        if (!operator) {
          const opCount = {};
          monthValidCreate.forEach((c) => {
            const t = c.taoRen || '未分配';
            opCount[t] = (opCount[t] || 0) + 1;
          });
          if (Object.keys(opCount).length > 0) operator = Object.keys(opCount).sort((a, b) => opCount[b] - opCount[a])[0];
        }

        const startDateObj = new Date(mn);
        const y = startDateObj.getFullYear();
        const monthIndex = startDateObj.getMonth();
        const daysInMonth = new Date(y, monthIndex + 1, 0).getDate();
        const dayCounts = [];
        const dayChannels = [];
        const monthValidCreateForOperate = monthValidCreate.filter((c) => !isMonthGoalChannelExcluded(c));
        for (let d = 1; d <= daysInMonth; d++) {
          const dayStart = new Date(y, monthIndex, d).getTime();
          const dayEnd = new Date(y, monthIndex, d + 1).getTime();
          const dayItems = monthValidCreateForOperate.filter((c) => toTime(c.createTime) >= dayStart && toTime(c.createTime) < dayEnd);
          const cnt = dayItems.length;
          const chMap = {};
          for (const di of dayItems) {
            const ch = di.channel && ('' + di.channel).trim() ? '' + di.channel : '未指定';
            chMap[ch] = (chMap[ch] || 0) + 1;
          }
          dayCounts.push(cnt);
          dayChannels.push(chMap);
        }
        const monthTotalByCreateTime = dayCounts.reduce((s, v) => s + v, 0);
        const tierLevel = getMonthGoalTierLevelForSelectedMonth(doc.name);
        const target1 = BASE_MONTH_GOAL_TARGETS[Math.min(tierLevel, BASE_MONTH_GOAL_TARGETS.length - 1)];
        const target2 = BASE_MONTH_GOAL_TARGETS[Math.min(tierLevel + 1, BASE_MONTH_GOAL_TARGETS.length - 1)];
        const target3 = BASE_MONTH_GOAL_TARGETS[Math.min(tierLevel + 2, BASE_MONTH_GOAL_TARGETS.length - 1)];
        const completionRate = target1 ? ((monthTotalByCreateTime / target1) * 100).toFixed(1) + '%' : '0%';

        return {
          name: doc.name,
          operator,
          todayTotal: todayAll.length,
          todayValid: todayValid.length,
          monthTotal: monthAllCreate.length,
          monthValid: monthValidCreate.length,
          monthZhuanWei,
          validRate,
          monthBookInitial,
          monthBookRevisit,
          monthBook,
          monthBookPrevInitial,
          monthBookPrevRevisit,
          monthBookPrev,
          monthNoPrescriptionOrNoPay: monthByRecTime.filter((c) => c.medicineDay === '未开药' || c.medicineDay === '未支付').length,
          monthNoPrescription: monthByRecTime.filter((c) => c.medicineDay === '未开药').length,
          monthNoPay: monthByRecTime.filter((c) => c.medicineDay === '未支付').length,
          monthBookUserCount,
          bookRate,
          monthArrive,
          monthOnlineArrive,
          monthOfflineArrive,
          dayCounts,
          dayChannels,
          monthTotalByCreateTime,
          completionRate,
          target1,
          target2,
          target3,
        };
      });

      const daysInMonth = (() => {
        const d = new Date(mn);
        const y = d.getFullYear();
        const m = d.getMonth();
        return new Date(y, m + 1, 0).getDate();
      })();
      const monthGoalDayTotals = new Array(daysInMonth).fill(0);
      for (const item of monthGoalStat) {
        const arr = item.dayCounts || [];
        for (let i = 0; i < daysInMonth; i++) {
          const v = arr && arr.length > i ? Number(arr[i]) || 0 : 0;
          monthGoalDayTotals[i] += v;
        }
      }

      res.json({ code: 200, data: { docStat, taoStat, bookUserStat, personnelStat, personnelTotals, personnelChannelBreakdown, monthGoalStat, monthGoalDayTotals, drugCostStat, medicineDayScheme: schemeForMonth } });
    } catch (e) {
      console.error('statAll error', e);
      try {
        const fs = require('fs');
        fs.appendFileSync('stat-error.log', nowStr() + ' ' + (e && e.stack ? e.stack : String(e)) + '\n');
      } catch (_) {}
      res.json({ code: 500, msg: '统计失败' });
    }
  });

  app.get('/api/debug/statDiff', authMiddleware, async (req, res) => {
    try {
      if (!ENABLE_DEBUG_ROUTES) return res.status(404).json({ code: 404, msg: 'Not Found' });
      const monthParam = req.query && req.query.month ? '' + req.query.month : '';
      const doctor = req.query.doctor || '';
      if (!monthParam || !/^[0-9]{4}-[0-9]{2}$/.test(monthParam)) return res.json({ code: 400, msg: 'month 参数缺失或格式不正确（YYYY-MM）' });
      if (!doctor) return res.json({ code: 400, msg: 'doctor 参数缺失' });
      const parts = monthParam.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const mn = new Date(y, m - 1, 1).getTime();
      const monthEndTs = new Date(y, m, 1).getTime();

      const clues = await query('SELECT * FROM clues');
      const toTime = (val) => {
        const t = new Date(val).getTime();
        return Number.isFinite(t) ? t : 0;
      };
      const recTime = (c) => {
        return toTime(c && c.visitDate ? (('' + c.visitDate).indexOf(':') === -1 ? c.visitDate + ' 00:00:00' : c.visitDate) : c && c.createTime);
      };
      const isValidIntent = (intent) => {
        return typeof intent === 'string' && intent.trim() !== '' && intent !== '无效';
      };

      const baseClues = clues.filter((c) => (c.revisitGroupId ? false : true));
      const recInMonth = baseClues.filter((c) => c.doctor === doctor && isValidIntent(c.intent) && recTime(c) >= mn && recTime(c) < monthEndTs);
      const createInMonth = baseClues.filter((c) => c.doctor === doctor && isValidIntent(c.intent) && toTime(c.createTime) >= mn && toTime(c.createTime) < monthEndTs);
      const recNotCreate = recInMonth.filter((c) => !(toTime(c.createTime) >= mn && toTime(c.createTime) < monthEndTs));
      const createNotRec = createInMonth.filter((c) => !(recTime(c) >= mn && recTime(c) < monthEndTs));
      const pick = (c) => ({ id: c.id, name: c.name, phone: c.phone, wechat: c.wechat, intent: c.intent, createTime: c.createTime, visitDate: c.visitDate, taoRen: c.taoRen, book: c.book, arrive: c.arrive, revisitGroupId: c.revisitGroupId });

      res.json({ code: 200, data: { month: monthParam, doctor, recCount: recInMonth.length, createCount: createInMonth.length, recNotCreate: recNotCreate.map(pick), createNotRec: createNotRec.map(pick) } });
    } catch (e) {
      console.error('debug/statDiff error', e);
      res.json({ code: 500, msg: '调试查询失败' });
    }
  });
}

module.exports = {
  registerStatsRoutes,
};
