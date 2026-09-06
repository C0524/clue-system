(function (global) {
  async function revisitList(vm) {
    return (global.ClueVisitsApi && typeof global.ClueVisitsApi.revisitList === 'function')
      ? await global.ClueVisitsApi.revisitList(vm)
      : await vm.apiCall('/api/revisitList');
  }

  async function expertSchedule(vm, queryString) {
    return (global.ClueVisitsApi && typeof global.ClueVisitsApi.expertSchedule === 'function')
      ? await global.ClueVisitsApi.expertSchedule(vm, queryString)
      : await vm.apiCall('/api/expertSchedule?' + (queryString || ''));
  }

  async function listVisits(vm, clueId) {
    return (global.ClueVisitsApi && typeof global.ClueVisitsApi.listVisits === 'function')
      ? await global.ClueVisitsApi.listVisits(vm, clueId)
      : await vm.apiCall('/api/visit/' + clueId);
  }

  async function addVisit(vm, payload) {
    return (global.ClueVisitsApi && typeof global.ClueVisitsApi.addVisit === 'function')
      ? await global.ClueVisitsApi.addVisit(vm, payload)
      : await vm.apiCall('/api/visit', { method: 'POST', body: JSON.stringify(payload || {}) });
  }

  async function updateVisit(vm, payload) {
    return (global.ClueVisitsApi && typeof global.ClueVisitsApi.updateVisit === 'function')
      ? await global.ClueVisitsApi.updateVisit(vm, payload)
      : await vm.apiCall('/api/updateVisit', { method: 'POST', body: JSON.stringify(payload || {}) });
  }

  async function scheduleRevisit(vm, payload) {
    return (global.ClueVisitsApi && typeof global.ClueVisitsApi.scheduleRevisit === 'function')
      ? await global.ClueVisitsApi.scheduleRevisit(vm, payload)
      : await vm.apiCall('/api/scheduleRevisit', { method: 'POST', body: JSON.stringify(payload || {}) });
  }

  async function getRevisitList(vm) {
    try {
      vm.revisitLoading = true;
      const d = await revisitList(vm);
      if (d && d.code === 200) {
        vm.revisitList = d.data || [];
        try {
          vm.revisitList.sort((a, b) => {
            const ta = new Date(a.visitDate || a.createTime).getTime() || 0;
            const tb = new Date(b.visitDate || b.createTime).getTime() || 0;
            return tb - ta;
          });
        } catch (e) {
          console.warn('revisitList sort error', e);
        }
        vm.revisitShowList = [].concat(vm.revisitList);
        vm.doRevisitSearch();
        vm.showMsg('复诊列表已刷新');
      } else {
        vm.showMsg((d && d.msg) || '刷新失败', 'error');
      }
    } catch (e) {
      console.error('getRevisitList error', e);
      vm.showMsg('刷新失败', 'error');
    } finally {
      vm.revisitLoading = false;
    }
  }

  async function getExpertSchedule(vm) {
    try {
      const m = (vm.expertScheduleSearch && vm.expertScheduleSearch.month)
        ? vm.expertScheduleSearch.month
        : (new Date()).toISOString().slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) {
        vm.showMsg('月份格式不正确', 'error');
        return;
      }
      vm.expertScheduleLoading = true;
      const parts = ['month=' + encodeURIComponent(m)];
      if (vm.expertScheduleSearch.doctor) parts.push('doctor=' + encodeURIComponent(vm.expertScheduleSearch.doctor));
      if (vm.expertScheduleSearch.bookUser) parts.push('bookUser=' + encodeURIComponent(vm.expertScheduleSearch.bookUser));
      const d = await expertSchedule(vm, parts.join('&'));
      if (d && d.code === 200 && d.data) {
        const payload = d.data || {};
        vm.expertScheduleRows = Array.isArray(payload.doctors) ? payload.doctors : [];
        vm.expertScheduleDays = Array.isArray(payload.days) ? payload.days : [];
        vm.expertScheduleDailyTotals = Array.isArray(payload.dailyTotals) ? payload.dailyTotals : [];
        vm.expertScheduleDoctorOptions = Array.isArray(payload.doctorOptions) ? payload.doctorOptions : [];
        vm.expertScheduleBookUserOptions = Array.isArray(payload.bookUserOptions) ? payload.bookUserOptions : [];
        if ((!vm.expertScheduleDoctorOptions || vm.expertScheduleDoctorOptions.length === 0) && Array.isArray(vm.doctorList)) {
          vm.expertScheduleDoctorOptions = vm.doctorList.map((x) => (x && x.name ? x.name : '')).filter(Boolean);
        }
        if ((!vm.expertScheduleBookUserOptions || vm.expertScheduleBookUserOptions.length === 0) && Array.isArray(vm.consultList)) {
          vm.expertScheduleBookUserOptions = vm.consultList.map((x) => (x && x.username ? x.username : '')).filter(Boolean);
        }
        vm.showExpertScheduleDetail = false;
      } else {
        vm.showMsg((d && d.msg) || '查询失败', 'error');
      }
    } catch (e) {
      console.error('getExpertSchedule error', e);
      vm.showMsg('查询失败', 'error');
    } finally {
      vm.expertScheduleLoading = false;
    }
  }

  function openScheduleRevisit(vm, item) {
    if (!item || !item.id) return;
    vm.revisitForm = {
      baseItemId: item.id,
      doctor: item.doctor || '',
      bookUser: (vm.user && vm.user.username) || '',
      visitMode: '',
      visitDate: '',
      regFee: '',
      dosageForm: '',
      medicineDay: '',
    };
    vm.revisitModalVisible = true;
  }

  async function submitScheduleRevisit(vm) {
    const f = vm.revisitForm;
    if (!f.baseItemId) {
      vm.showMsg('无效的复诊来源', 'error');
      return;
    }
    if (!f.doctor) {
      vm.showMsg('请选择复诊预约医生', 'error');
      return;
    }
    if (!f.bookUser) {
      vm.showMsg('请选择复诊预约人员', 'error');
      return;
    }
    if (!f.visitMode) {
      vm.showMsg('请选择就诊方式', 'error');
      return;
    }
    if (!f.visitDate) {
      vm.showMsg('请选择预约时间', 'error');
      return;
    }
    if (vm.revisitRegFeeMissing) {
      vm.showMsg('请填写挂号费（可填写 0）', 'error');
      return;
    }

    vm.isLoading = true;
    try {
      const payload = {
        baseId: f.baseItemId,
        doctor: f.doctor,
        bookUser: f.bookUser,
        visitMode: f.visitMode,
        visitDate: f.visitDate,
        regFee: f.regFee,
      };
      const res = await scheduleRevisit(vm, payload);
      if (res && res.code === 200) {
        vm.showMsg('复诊已安排并保存');
        vm.closeScheduleRevisit();
        await vm.getRevisitList();
      } else if (res && res.code === 409 && res.duplicateType === 'same_patient_same_day_revisit') {
        alert(res.msg || '该患者在同一天已有复诊预约，请勿重复预约');
      }
    } catch (e) {
      console.error('submitScheduleRevisit error', e);
      vm.showMsg('安排失败', 'error');
    } finally {
      vm.isLoading = false;
    }
  }

  async function openRevisitVisit(vm, item, ctx) {
    if (!item || !item.id) return;
    vm.selectedRevisitItem = item;
    vm.revisitVisitContent = '';
    vm.revisitVisitList = [];
    vm.revisitVisitContext = ctx || '咨询';
    try {
      const res = await listVisits(vm, item.id);
      if (res && res.code === 200) {
        let list = (res.data || []).slice();
        try {
          const note = item.content || item.note || item.remark || '';
          if (note && typeof note === 'string' && note.trim() !== '') {
            const entry = {
              time: item.createTime || item.uploadedAt || new Date().toISOString(),
              user: item.username || item.taoRen || '录入',
              content: note,
            };
            const exists = list.find((x) => x && x.content === entry.content && x.user === entry.user);
            if (!exists) list.push(entry);
          }
        } catch (e) {
          console.warn('prepend note to revisit list failed', e);
        }
        list.sort((a, b) => {
          const ta = new Date(a && a.time ? a.time : 0).getTime();
          const tb = new Date(b && b.time ? b.time : 0).getTime();
          return ta - tb;
        });
        vm.revisitVisitList = list;
      }
    } catch (e) {
      console.error('openRevisitVisit error', e);
    }
    vm.showRevisitVisitModal = true;
  }

  async function submitRevisitVisit(vm) {
    if (!vm.revisitVisitContent || !vm.selectedRevisitItem) {
      vm.showMsg('请输入回访内容', 'error');
      return;
    }
    vm.isLoading = true;
    try {
      const payload = {
        id: vm.selectedRevisitItem.id,
        content: vm.revisitVisitContent,
        user: (vm.user && vm.user.username) || '',
      };
      const res = await addVisit(vm, payload);
      if (res && res.code === 200) {
        const d = await listVisits(vm, vm.selectedRevisitItem.id);
        if (d && d.code === 200) vm.revisitVisitList = d.data || [];
        vm.revisitVisitContent = '';
        vm.showMsg('回访已添加');
        await vm.refreshCurrentTabAfterSave();
      }
    } catch (e) {
      console.error('submitRevisitVisit error', e);
      vm.showMsg('添加失败', 'error');
    } finally {
      vm.isLoading = false;
    }
  }

  async function submitDetailRevisit(vm) {
    if (!vm.revisitVisitContent || !vm.currentDetail || !vm.currentDetail.id) {
      vm.showMsg('请输入回访内容', 'error');
      return;
    }
    vm.isLoading = true;
    try {
      if (vm.revisitDraftId) {
        const upd = await updateVisit(vm, { id: vm.revisitDraftId, content: vm.revisitVisitContent });
        if (upd && upd.code === 200) {
          const d = await listVisits(vm, vm.currentDetail.id);
          if (d && d.code === 200) vm.currentVisit = d.data || [];
          await vm.fetchAndApplyCurrentDetail(vm.currentDetail.id);
          vm.revisitVisitContent = '';
          vm.showMsg('回访已添加');
          await vm.refreshCurrentTabAfterSave();
          vm.revisitDraftId = null;
        }
      } else {
        const payload = {
          id: vm.currentDetail.id,
          content: vm.revisitVisitContent,
          user: (vm.user && vm.user.username) || '',
        };
        const res = await addVisit(vm, payload);
        if (res && res.code === 200) {
          const d = await listVisits(vm, vm.currentDetail.id);
          if (d && d.code === 200) vm.currentVisit = d.data || [];
          await vm.fetchAndApplyCurrentDetail(vm.currentDetail.id);
          vm.revisitVisitContent = '';
          vm.showMsg('回访已添加');
          await vm.refreshCurrentTabAfterSave();
        }
      }
    } catch (e) {
      console.error('submitDetailRevisit error', e);
      vm.showMsg('添加失败', 'error');
    } finally {
      vm.isLoading = false;
    }
  }

  global.ClueRevisitModule = {
    getRevisitList: getRevisitList,
    getExpertSchedule: getExpertSchedule,
    openScheduleRevisit: openScheduleRevisit,
    submitScheduleRevisit: submitScheduleRevisit,
    openRevisitVisit: openRevisitVisit,
    submitRevisitVisit: submitRevisitVisit,
    submitDetailRevisit: submitDetailRevisit,
  };
})(window);
