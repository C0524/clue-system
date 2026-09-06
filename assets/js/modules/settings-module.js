(function (global) {
  async function listUsers(vm) {
    return (global.ClueUsersApi && typeof global.ClueUsersApi.listUsers === 'function')
      ? await global.ClueUsersApi.listUsers(vm)
      : await vm.apiCall('/api/users');
  }

  async function changeUserPasswordReq(vm, username, newPassword) {
    var payload = { username: username, newPassword: newPassword };
    return (global.ClueUsersApi && typeof global.ClueUsersApi.changeUserPassword === 'function')
      ? await global.ClueUsersApi.changeUserPassword(vm, payload)
      : await vm.apiCall('/api/changeUserPassword', { method: 'POST', body: JSON.stringify(payload) });
  }

  async function updateUserRoleReq(vm, username, role) {
    var payload = { username: username, role: role };
    return (global.ClueUsersApi && typeof global.ClueUsersApi.updateUserRole === 'function')
      ? await global.ClueUsersApi.updateUserRole(vm, payload)
      : await vm.apiCall('/api/updateUserRole', { method: 'POST', body: JSON.stringify(payload) });
  }

  async function listDoctors(vm) {
    return (global.ClueDoctorsApi && typeof global.ClueDoctorsApi.listDoctors === 'function')
      ? await global.ClueDoctorsApi.listDoctors(vm)
      : await vm.apiCall('/api/doctors');
  }

  async function addUserReq(vm, payload) {
    return (global.ClueUsersApi && typeof global.ClueUsersApi.addUser === 'function')
      ? await global.ClueUsersApi.addUser(vm, payload)
      : await vm.apiCall('/api/addUser', { method: 'POST', body: JSON.stringify(payload || {}) });
  }

  async function delUserReq(vm, payload) {
    return (global.ClueUsersApi && typeof global.ClueUsersApi.delUser === 'function')
      ? await global.ClueUsersApi.delUser(vm, payload)
      : await vm.apiCall('/api/delUser', { method: 'POST', body: JSON.stringify(payload || {}) });
  }

  async function addDoctorReq(vm, payload) {
    return (global.ClueDoctorsApi && typeof global.ClueDoctorsApi.addDoctor === 'function')
      ? await global.ClueDoctorsApi.addDoctor(vm, payload)
      : await vm.apiCall('/api/addDoctor', { method: 'POST', body: JSON.stringify(payload || {}) });
  }

  async function updateDoctorReq(vm, payload) {
    return (global.ClueDoctorsApi && typeof global.ClueDoctorsApi.updateDoctor === 'function')
      ? await global.ClueDoctorsApi.updateDoctor(vm, payload)
      : await vm.apiCall('/api/updateDoctor', { method: 'POST', body: JSON.stringify(payload || {}) });
  }

  async function delDoctorReq(vm, payload) {
    return (global.ClueDoctorsApi && typeof global.ClueDoctorsApi.delDoctor === 'function')
      ? await global.ClueDoctorsApi.delDoctor(vm, payload)
      : await vm.apiCall('/api/delDoctor', { method: 'POST', body: JSON.stringify(payload || {}) });
  }

  async function fetchAssignableRows(vm, payload) {
    if (vm.assignSource === 'publicPool') {
      if (global.ClueCluesApi && typeof global.ClueCluesApi.publicPoolList === 'function') {
        return global.ClueCluesApi.publicPoolList(vm, payload);
      }
      return vm.apiCall('/api/publicPoolList', { method: 'POST', body: JSON.stringify(payload) });
    }
    if (global.ClueCluesApi && typeof global.ClueCluesApi.list === 'function') {
      return global.ClueCluesApi.list(vm, payload);
    }
    return vm.apiCall('/api/list', { method: 'POST', body: JSON.stringify(payload) });
  }

  async function assignCluesReq(vm, payload) {
    return (global.ClueCluesApi && typeof global.ClueCluesApi.assignClues === 'function')
      ? await global.ClueCluesApi.assignClues(vm, payload)
      : await vm.apiCall('/api/assignClues', { method: 'POST', body: JSON.stringify(payload || {}) });
  }

  function buildConsultList(vm) {
    vm.consultList = (vm.userList || []).filter(function (u) {
      return u && (u.role === '咨询' || u.role === '套电' || u.role === '医助' || u.role === '主管');
    });
    if (!vm.consultList || vm.consultList.length === 0) {
      vm.consultList = (vm.userList || []).filter(function (u) { return u && u.username; });
    }
    vm.assignTarget = vm.assignTarget || (vm.consultList && vm.consultList.length ? vm.consultList[0].username : '');
  }

  async function getUsers(vm) {
    try {
      var role = (vm.user && vm.user.role) ? String(vm.user.role).trim() : '';
      if (role === '咨询') {
        vm.buildConsultListFromLocalData();
        return;
      }
    } catch (_) {}

    var d = await listUsers(vm);

    if (d && d.code === 200) {
      vm.userList = d.data || [];
      buildConsultList(vm);
    } else if (d && d.code === 403) {
      vm.buildConsultListFromLocalData();
    }
  }

  async function changeUserPassword(vm, username) {
    try {
      var np = prompt('请输入 ' + username + ' 的新密码：');
      if (!np) return;
      vm.isLoading = true;
      var res = await changeUserPasswordReq(vm, username, np);
      vm.isLoading = false;
      if (res && res.code === 200) {
        vm.showMsg('密码修改成功');
      } else {
        vm.showMsg((res && res.msg) ? res.msg : '修改失败', 'error');
      }
    } catch (e) {
      vm.isLoading = false;
      console.error('changeUserPassword error', e);
      vm.showMsg('修改失败', 'error');
    }
  }

  async function changeUserRole(vm, username) {
    try {
      var allowed = ['咨询', '医助', '主管', '运营', '套电', '超级管理员', '数据'];
      var role = prompt('请输入新角色（可选：咨询,医助,主管,运营,套电,超级管理员,数据）', '主管');
      if (!role) return;
      role = String(role).trim();
      if (allowed.indexOf(role) === -1) {
        vm.showMsg('非法角色', 'error');
        return;
      }
      vm.isLoading = true;
      var res = await updateUserRoleReq(vm, username, role);
      vm.isLoading = false;
      if (res && res.code === 200) {
        vm.showMsg('角色修改成功');
        await getUsers(vm);
      } else {
        vm.showMsg((res && res.msg) ? res.msg : '修改失败', 'error');
      }
    } catch (e) {
      vm.isLoading = false;
      console.error('changeUserRole error', e);
      vm.showMsg('修改失败', 'error');
    }
  }

  async function getDoctors(vm) {
    var d = await listDoctors(vm);
    if (d && d.code === 200) vm.doctorList = d.data;
  }

  async function addUser(vm) {
    if (!vm.newUser || !vm.newPwd) {
      vm.showMsg('请输入用户名和密码', 'error');
      return;
    }
    var data = await addUserReq(vm, { username: vm.newUser, password: vm.newPwd, role: vm.newRole });
    if (data && data.code === 200) {
      vm.showMsg('用户添加成功');
      vm.newUser = '';
      vm.newPwd = '';
      vm.newRole = '咨询';
      await getUsers(vm);
    }
  }

  async function delUser(vm, username) {
    if (!confirm('确定删除用户 ' + username + ' 吗？')) return;
    var data = await delUserReq(vm, { username: username });
    if (data && data.code === 200) {
      vm.showMsg('用户删除成功');
      await getUsers(vm);
    }
  }

  async function addDoctor(vm) {
    if (!vm.newDoc.name || !vm.newDoc.dept) {
      vm.showMsg('请输入医生姓名和科室', 'error');
      return;
    }
    var payload = { name: vm.newDoc.name, dept: vm.newDoc.dept, operator: vm.newDoc.operator };
    var data = await addDoctorReq(vm, payload);
    if (data && data.code === 200) {
      vm.showMsg('医生添加成功');
      vm.newDoc = { name: '', dept: '', operator: '' };
      await getDoctors(vm);
    }
  }

  function startEditDoctor(vm, doctor) {
    vm.editingDoctor = { name: doctor.name, dept: doctor.dept || '', operator: doctor.operator || '' };
  }

  async function saveDoctorEdit(vm) {
    if (!vm.editingDoctor || !vm.editingDoctor.name) return;
    try {
      var res = await updateDoctorReq(vm, {
        name: vm.editingDoctor.name,
        dept: vm.editingDoctor.dept,
        operator: vm.editingDoctor.operator
      });
      if (res && res.code === 200) {
        vm.showMsg('医生信息更新成功');
        vm.editingDoctor = null;
        await getDoctors(vm);
      } else {
        vm.showMsg('更新失败', 'error');
      }
    } catch (e) {
      console.error('更新医生失败', e);
      vm.showMsg('更新失败', 'error');
    }
  }

  function cancelEditDoctor(vm) {
    vm.editingDoctor = null;
  }

  async function delDoctor(vm, name) {
    if (!confirm('确定删除医生 ' + name + ' 吗？')) return;
    var data = await delDoctorReq(vm, { name: name });
    if (data && data.code === 200) {
      vm.showMsg('医生删除成功');
      await getDoctors(vm);
    }
  }

  async function openAssignModal(vm, source) {
    vm.assignSource = source || (vm.tab === 8 ? 'publicPool' : 'list');
    vm.assignScope = 'page';
    vm.showAssignModal = true;
    try {
      var modalEl = document.getElementById('assign-modal');
      if (modalEl) modalEl.classList.add('show');
    } catch (_) {}
    vm.assignLoading = true;
    try {
      var usersResp = await listUsers(vm);
      if (usersResp && usersResp.code === 200 && Array.isArray(usersResp.data)) {
        var allUsers = usersResp.data;
        var consultUsers = allUsers.filter(function (u) {
          if (!u || !u.username) return false;
          var role = (u.role || '').trim();
          return role === '咨询' || role === '主管';
        });
        vm.assignConsultList = consultUsers.length > 0 ? consultUsers : [];
        if (!vm.assignTarget || !vm.assignConsultList.some(function (u) { return u.username === vm.assignTarget; })) {
          vm.assignTarget = vm.assignConsultList.length > 0 ? vm.assignConsultList[0].username : '';
        }
      } else {
        vm.assignConsultList = [];
        vm.assignTarget = '';
        console.warn('openAssignModal: fetch users failed', usersResp);
      }

      var payload = Object.assign({}, vm.search || {}, { all: true });
      try {
        var raceRes = await Promise.race([
          fetchAssignableRows(vm, payload),
          new Promise(function (resolve) { setTimeout(function () { resolve({ timeout: true }); }, 3000); })
        ]);
        if (raceRes && raceRes.timeout) {
          vm.filteredCount = 0;
          console.warn('openAssignModal: filteredCount request timed out');
        } else if (raceRes && raceRes.code === 200) {
          if (Array.isArray(raceRes.data)) vm.filteredCount = raceRes.data.length;
          else if (raceRes.data && Array.isArray(raceRes.data.rows)) vm.filteredCount = raceRes.data.rows.length;
          else vm.filteredCount = 0;
        } else {
          vm.filteredCount = 0;
        }
      } catch (e) {
        console.warn('openAssignModal: filteredCount fetch error', e);
        vm.filteredCount = 0;
      }
    } catch (e) {
      console.error('openAssignModal error', e);
      vm.showMsg('打开分配弹窗失败', 'error');
    } finally {
      vm.assignLoading = false;
    }
  }

  function closeAssignModal(vm) {
    vm.showAssignModal = false;
    vm.assignScope = 'page';
    vm.assignSource = 'list';
    vm.assignTarget = '';
    try {
      var modalEl = document.getElementById('assign-modal');
      if (modalEl) modalEl.classList.remove('show');
    } catch (_) {}
    vm.assignNote = '';
    vm.filteredCount = 0;
    vm.assignConsultList = [];
    vm.assignLoading = false;
  }

  async function submitAssign(vm) {
    try {
      if (!vm.assignTarget) {
        vm.showMsg('请选择分配给的咨询账号', 'error');
        return;
      }
      var body = { assignedTo: vm.assignTarget, note: vm.assignNote, source: vm.assignSource };
      if (vm.assignSource === 'publicPool') {
        var restoreTag = '公海再分配';
        var rawNote = (vm.assignNote || '').trim();
        var hasTag = rawNote.indexOf(restoreTag) !== -1;
        body.note = hasTag ? rawNote : (rawNote ? (rawNote + ' | ' + restoreTag) : restoreTag);
      }
      if (vm.assignSource === 'publicPool' || vm.assignScope === 'page') {
        if (!vm.selectedIds || vm.selectedIds.length === 0) {
          vm.showMsg('本页未选择任何线索', 'error');
          return;
        }
        body.ids = vm.selectedIds.slice();
      } else {
        var approx = Number(vm.filteredCount) || 0;
        var ok = confirm('当前为“全部筛选结果”分配，将按当前筛选批量分配约 ' + approx + ' 条线索，确认继续？');
        if (!ok) return;
        body.filter = Object.assign({}, vm.search || {});
        body.filter.all = true;
      }

      vm.assignLoading = true;
      var res = await assignCluesReq(vm, body);
      vm.assignLoading = false;
      if (res && res.code === 200) {
        var msg = '分配完成：已分配 ' + (res.data && res.data.assigned ? res.data.assigned : 0) + ' 条，跳过 ' + (res.data && res.data.skipped ? res.data.skipped : 0) + ' 条';
        vm.showMsg(msg);
        var assignedSource = vm.assignSource;
        closeAssignModal(vm);
        if (assignedSource === 'publicPool') {
          vm.getPublicPoolList(vm.publicPoolCurrentPage || 1);
          vm.getList(vm.currentPage || 1);
        } else {
          vm.getList(vm.currentPage || 1);
        }
        try {
          if (body.ids && body.ids.length) {
            vm.selectedIds = (vm.selectedIds || []).filter(function (id) { return body.ids.indexOf(id) === -1; });
          }
        } catch (_) {}
      } else {
        vm.showMsg((res && res.msg) ? res.msg : '分配失败', 'error');
      }
    } catch (e) {
      vm.assignLoading = false;
      console.error('submitAssign error', e);
      vm.showMsg('分配异常', 'error');
    }
  }

  global.ClueSettingsModule = {
    getUsers: getUsers,
    addUser: addUser,
    delUser: delUser,
    changeUserPassword: changeUserPassword,
    changeUserRole: changeUserRole,
    getDoctors: getDoctors,
    addDoctor: addDoctor,
    startEditDoctor: startEditDoctor,
    saveDoctorEdit: saveDoctorEdit,
    cancelEditDoctor: cancelEditDoctor,
    delDoctor: delDoctor,
    openAssignModal: openAssignModal,
    closeAssignModal: closeAssignModal,
    submitAssign: submitAssign,
  };
})(window);
