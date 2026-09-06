(function (global) {
  function resolveTaoRenForEdit(user, selectedValue) {
    if (user && user.role === '超级管理员') {
      return selectedValue;
    }
    return (user && user.username) || selectedValue;
  }

  function openEdit(vm, item) {
    vm.editingId = item.id;
    vm.editForm = {
      taoRen: item.taoRen || '',
      channel: item.channel || '',
      name: item.name || '',
      gender: item.gender || '',
      age: item.age || '',
      phone: item.phone || '',
      wechat: item.wechat || '',
      doctor: item.doctor || '',
      regDoctor: item.regDoctor || item.doctor || '',
      department: item.department || '',
      createTime: item.createTime || '',
      content: item.content || '',
      intent: item.intent || '',
      visitStatus: item.visitStatus || '',
      bookUser: item.bookUser || '',
      book: item.book || '',
      arrive: item.arrive || '',
      medicineDay: item.medicineDay || '',
      cost: item.cost || '',
      visitMode: item.visitMode || '',
      visitDate: item.visitDate || ''
    };
    vm.showEditModal = true;
  }

  function closeEdit(vm) {
    vm.showEditModal = false;
    vm.editingId = null;
    vm.editForm = {};
  }

  async function fetchAndApplyCurrentDetail(vm, id) {
    try {
      const updated = await vm.fetchClueById(id);
      if (updated) {
        vm.currentDetail = updated;
        vm.editDetail = JSON.parse(JSON.stringify(vm.currentDetail || {}));
        vm.applyFetchedToLocal(updated);
        vm.flashRow(updated.id);
      }
    } catch (e) {
      console.warn('fetchAndApplyCurrentDetail error', e);
    }
  }

  async function saveEdit(vm) {
    if (!vm.editingId) {
      vm.showMsg('无效的线索ID', 'error');
      return;
    }
    if (!vm.editForm.phone && !vm.editForm.wechat) {
      vm.showMsg('电话或微信至少保留一个', 'error');
      return;
    }
    const updates = {
      taoRen: vm.editForm.taoRen,
      channel: vm.editForm.channel,
      name: vm.editForm.name,
      gender: vm.editForm.gender,
      age: vm.editForm.age,
      phone: vm.editForm.phone,
      wechat: vm.editForm.wechat,
      doctor: vm.editForm.doctor,
      regDoctor: vm.editForm.regDoctor,
      department: vm.editForm.department,
      createTime: vm.editForm.createTime,
      content: vm.editForm.content,
      intent: vm.editForm.intent,
      bookUser: vm.editForm.bookUser,
      book: vm.editForm.book,
      arrive: vm.editForm.arrive,
      medicineDay: vm.editForm.medicineDay,
      cost: vm.editForm.cost,
      visitMode: vm.editForm.visitMode,
      visitDate: vm.editForm.visitDate
    };

    try {
      if (!(vm.user && vm.user.role === '超级管理员')) {
        delete updates.createTime;
      }
    } catch (_) {}

    vm.isLoading = true;
    try {
      if (vm.user && vm.user.role === '超级管理员') {
        updates.taoRen = resolveTaoRenForEdit(vm.user, updates.taoRen);
      } else {
        delete updates.taoRen;
      }
    } catch (_) {}
    try {
      if (updates.book === '已预约' && (!updates.bookUser || updates.bookUser === '')) {
        updates.bookUser = (vm.user && vm.user.username) || updates.bookUser;
      }
    } catch (_) {}

    const data = await vm.apiCall('/api/updateClue', {
      method: 'POST',
      body: JSON.stringify({ id: vm.editingId, updates })
    });

    vm.isLoading = false;
    if (data && data.code === 200) {
      vm.showMsg('修改成功');
      const savedId = vm.editingId;
      closeEdit(vm);
      try {
        const updated = await vm.fetchClueById(savedId);
        if (updated) {
          vm.applyFetchedToLocal(updated);
          vm.flashRow(updated.id);
        }
      } catch (e) {
        console.warn('fetch single clue after saveEdit failed', e);
      }
      await vm.refreshCurrentTabAfterSave();
    }
  }

  global.ClueEditModule = {
    openEdit: openEdit,
    closeEdit: closeEdit,
    fetchAndApplyCurrentDetail: fetchAndApplyCurrentDetail,
    saveEdit: saveEdit,
    resolveTaoRenForEdit: resolveTaoRenForEdit,
  };
})(window);
