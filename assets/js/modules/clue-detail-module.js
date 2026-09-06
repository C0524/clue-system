(function (global) {
  function revokeUploadQueuePreviews(vm) {
    try {
      (vm.uploadQueue || []).forEach(function (it) {
        try {
          if (it && it.preview) URL.revokeObjectURL(it.preview);
        } catch (_) {}
      });
    } catch (_) {}
  }

  function setDetailImages(vm, list) {
    var imgsList = list || [];
    try {
      if (vm.$set) vm.$set(vm.currentDetail, 'images', imgsList);
      else if (typeof Vue !== 'undefined' && Vue.set) Vue.set(vm.currentDetail, 'images', imgsList);
      else vm.currentDetail.images = imgsList;
    } catch (_) {
      vm.currentDetail.images = imgsList;
    }
  }

  function imagesSignature(list) {
    return JSON.stringify((list || []).map(function (x) {
      return { k: (x.id || x.key || ''), t: (x.thumbSmallKey || x.thumbKey || '') };
    }));
  }

  async function listVisits(vm, clueId) {
    return (global.ClueVisitsApi && typeof global.ClueVisitsApi.listVisits === 'function')
      ? await global.ClueVisitsApi.listVisits(vm, clueId)
      : await vm.apiCall('/api/visit/' + clueId);
  }

  async function clueImages(vm, clueId) {
    return (global.ClueVisitsApi && typeof global.ClueVisitsApi.clueImages === 'function')
      ? await global.ClueVisitsApi.clueImages(vm, clueId)
      : await vm.apiCall('/api/clueImages?clueId=' + clueId);
  }

  async function updateVisit(vm, payload) {
    return (global.ClueVisitsApi && typeof global.ClueVisitsApi.updateVisit === 'function')
      ? await global.ClueVisitsApi.updateVisit(vm, payload)
      : await vm.apiCall('/api/updateVisit', { method: 'POST', body: JSON.stringify(payload || {}) });
  }

  async function createVisit(vm, payload) {
    return (global.ClueVisitsApi && typeof global.ClueVisitsApi.createVisit === 'function')
      ? await global.ClueVisitsApi.createVisit(vm, payload)
      : await vm.apiCall('/api/createVisit', { method: 'POST', body: JSON.stringify(payload || {}) });
  }

  async function associateImagesToVisit(vm, payload) {
    return (global.ClueVisitsApi && typeof global.ClueVisitsApi.associateImagesToVisit === 'function')
      ? await global.ClueVisitsApi.associateImagesToVisit(vm, payload)
      : await vm.apiCall('/api/associateImagesToVisit', { method: 'POST', body: JSON.stringify(payload || {}) });
  }

  async function saveDetailEdits(vm) {
    if (vm.detailSaving) return;
    if (!vm.currentDetail || !vm.currentDetail.id) {
      vm.showMsg('无效的线索', 'error');
      return;
    }
    if (!vm.canEditDetail(vm.currentDetail)) {
      vm.showMsg('无权限修改该话单', 'error');
      return;
    }
    vm.detailSaving = true;
    vm.isLoading = true;

    try {
      try {
        vm.detailErrors = {};
      } catch (_) {}

      try {
        var oldBook = (vm.currentDetail && vm.currentDetail.book ? String(vm.currentDetail.book) : '').trim();
        var newBook = (vm.editDetail && vm.editDetail.book ? String(vm.editDetail.book) : '').trim();
        var changedToBooked = oldBook !== '已预约' && newBook === '已预约';
        if (changedToBooked) {
          var visitDateVal = (vm.editDetail && vm.editDetail.visitDate ? String(vm.editDetail.visitDate) : '').trim();
          var regFeeRaw = vm.editDetail ? vm.editDetail.regFee : undefined;
          var regFeeMissing = regFeeRaw === '' || regFeeRaw === null || typeof regFeeRaw === 'undefined' || Number.isNaN(Number(regFeeRaw));
          var hasBookingErrors = false;
          if (!visitDateVal) {
            vm.detailErrors.visitDate = '当预约改为“已预约”时，预约时间为必填项';
            hasBookingErrors = true;
          }
          if (regFeeMissing) {
            vm.detailErrors.regFee = '当预约改为“已预约”时，挂号费为必填项（可填写 0）';
            hasBookingErrors = true;
          }
          if (hasBookingErrors) {
            vm.showMsg('请先完善预约时间和挂号费后再保存', 'error');
            vm.isLoading = false;
            vm.detailSaving = false;
            return;
          }
        }
      } catch (e) {
        console.warn('validate booking required fields failed', e);
      }

      if (vm.user && vm.user.role === '医助' && vm.tab == 6) {
        var md = (vm.editDetail && vm.editDetail.medicineDay) ? String(vm.editDetail.medicineDay) : '';
        var needDosageForm = !(md && md.startsWith('未'));
        var required = ['medicineDay', 'regFee', 'cost', 'treatmentFee'];
        if (needDosageForm) required.splice(1, 0, 'dosageForm');
        var map = { medicineDay: '开药天数', dosageForm: '剂型', regFee: '挂号费', cost: '药费', treatmentFee: '治疗费' };
        var missing = [];
        for (var i = 0; i < required.length; i++) {
          var f = required[i];
          var v = (vm.editDetail && typeof vm.editDetail[f] !== 'undefined') ? vm.editDetail[f] : undefined;
          if (v === undefined || v === '' || v === null || (['regFee', 'cost', 'treatmentFee'].includes(f) && (v === '' || isNaN(Number(v))))) {
            missing.push(f);
            try {
              vm.detailErrors[f] = map[f] + ' 为必填项；若无费用请填写 0';
            } catch (_) {}
          }
        }
        if (missing.length > 0) {
          vm.isLoading = false;
          vm.detailSaving = false;
          return;
        }
      }
    } catch (e) {
      console.warn('validate required for 医助 failed', e);
    }

    try {
      var keys = ['taoRen', 'channel', 'name', 'gender', 'age', 'phone', 'wechat', 'doctor', 'regDoctor', 'department', 'intent', 'bookUser', 'book', 'visitDate', 'visitMode', 'medicineDay', 'dosageForm', 'cost', 'regFee', 'treatmentFee', 'content', 'preCase', 'createTime'];
      var clientProtected = ['name', 'phone', 'wechat', 'gender', 'age'];
      var updates = {};

      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        try {
          var newVal = vm.editDetail && (typeof vm.editDetail[k] !== 'undefined') ? vm.editDetail[k] : undefined;
          var oldVal = vm.currentDetail && (typeof vm.currentDetail[k] !== 'undefined') ? vm.currentDetail[k] : undefined;
          if (typeof newVal !== 'undefined' && String(newVal) !== String(oldVal)) {
            if (clientProtected.includes(k) && (newVal === '' || newVal === null)) {
              // Skip protected empty field.
            } else {
              updates[k] = newVal;
            }
          }
        } catch (e) {
          console.warn('collect update field failed', k, e);
        }
      }

      if (Object.keys(updates).length > 0) {
        var updatePayload = { id: vm.currentDetail.id, updates: updates };
        var resp = (global.ClueCluesApi && typeof global.ClueCluesApi.updateClueMany === 'function')
          ? await global.ClueCluesApi.updateClueMany(vm, updatePayload)
          : await vm.apiCall('/api/updateMany', { method: 'POST', body: JSON.stringify(updatePayload) });
        if (!resp || resp.code !== 200) {
          vm.showMsg((resp && resp.msg) ? resp.msg : '保存失败（更新）', 'error');
          vm.isLoading = false;
          return;
        }
      }

      if (vm.revisitVisitContent && String(vm.revisitVisitContent).trim() !== '') {
        if (vm.revisitDraftId) {
          await updateVisit(vm, { id: vm.revisitDraftId, content: vm.revisitVisitContent });
        } else {
          var created = await createVisit(vm, { id: vm.currentDetail.id, content: vm.revisitVisitContent });

          if (created && created.code === 200 && created.data && created.data.id) {
            var newVisitId = created.data.id;
            vm.revisitDraftId = newVisitId;
            try {
              var imageKeys = (vm.uploadedImages || []).map(function (it) { return it.key; }).filter(Boolean);
              if (imageKeys.length > 0) {
                await associateImagesToVisit(vm, { visitId: newVisitId, keys: imageKeys });
              }
            } catch (e) {
              console.warn('associate images to visit failed', e);
            }
          }
        }

        try {
          var d = await listVisits(vm, vm.currentDetail.id);
          if (d && d.code === 200) vm.currentVisit = d.data || [];
        } catch (_) {}

        vm.revisitVisitContent = '';
        vm.revisitDraftId = null;
      }

      await vm.fetchAndApplyCurrentDetail(vm.currentDetail.id);
      revokeUploadQueuePreviews(vm);
      vm.uploadQueue = [];
      vm.uploadedImages = [];
      vm.detailEditing = false;
      vm.showMsg('保存成功');
      await vm.refreshCurrentTabAfterSave();
    } catch (e) {
      console.error('saveDetailEdits error', e);
      vm.showMsg('保存失败', 'error');
    } finally {
      vm.isLoading = false;
      vm.detailSaving = false;
    }
  }

  async function openDetail(vm, item) {
    try {
      vm.currentDetail = item || {};
      vm.detailEditing = false;
      vm.editDetail = JSON.parse(JSON.stringify(vm.currentDetail || {}));
      vm.preCaseEditing = false;
      vm.preCaseExpanded = false;
      vm.preCaseDraft = vm.currentDetail.preCase || '';
      vm.revisitVisitContent = '';
      try {
        vm.revisitDraftId = null;
      } catch (_) {}
      revokeUploadQueuePreviews(vm);
      vm.uploadQueue = [];
      vm.uploadedImages = [];
      vm.showDetail = true;

      if (item && item.id) {
        var visits = await listVisits(vm, item.id);

        if (visits && visits.code === 200) {
          var visitList = (visits.data || []).slice();
          visitList.sort(function (a, b) {
            var ta = new Date(a && a.time ? a.time : 0).getTime();
            var tb = new Date(b && b.time ? b.time : 0).getTime();
            return ta - tb;
          });
          vm.currentVisit = visitList;
        } else {
          vm.currentVisit = [];
        }

        try {
          var imgs = await clueImages(vm, item.id);
          if (imgs && imgs.code === 200) {
            setDetailImages(vm, imgs.data || []);
          } else {
            setDetailImages(vm, []);
          }
          vm.editDetail = JSON.parse(JSON.stringify(vm.currentDetail || {}));
        } catch (e) {
          console.warn('fetch images failed', e);
          vm.currentDetail.images = [];
        }

        try {
          if (vm._clueImagesTimer) clearInterval(vm._clueImagesTimer);

          var quickRetries = 5;
          var quickInterval = 2000;
          var longInterval = 8000;

          var tryFetchAndUpdate = async function () {
            try {
              var imgs2 = await clueImages(vm, item.id);
              if (imgs2 && imgs2.code === 200) {
                var curList = (vm.currentDetail && vm.currentDetail.images) ? vm.currentDetail.images : [];
                var curSig = imagesSignature(curList);
                var nwSig = imagesSignature(imgs2.data || []);
                if (curSig !== nwSig) {
                  setDetailImages(vm, imgs2.data || []);
                  vm.editDetail = JSON.parse(JSON.stringify(vm.currentDetail || {}));
                }
                return imgs2.data || [];
              }
            } catch (_) {}
            return null;
          };

          tryFetchAndUpdate().then(function (initialList) {
            var needsThumb = (initialList || []).some(function (x) { return !(x && (x.thumbSmallKey || x.thumbKey)); });
            if (needsThumb) {
              vm._clueImagesTimer = setInterval(async function () {
                try {
                  var list = await tryFetchAndUpdate();
                  quickRetries -= 1;
                  var stillNeeds = (list || []).some(function (x) { return !(x && (x.thumbSmallKey || x.thumbKey)); });
                  if (!stillNeeds || quickRetries <= 0) {
                    clearInterval(vm._clueImagesTimer);
                    vm._clueImagesTimer = setInterval(async function () {
                      try {
                        await tryFetchAndUpdate();
                      } catch (_) {}
                    }, longInterval);
                  }
                } catch (_) {}
              }, quickInterval);
            } else {
              vm._clueImagesTimer = setInterval(async function () {
                try {
                  await tryFetchAndUpdate();
                } catch (_) {}
              }, longInterval);
            }
          }).catch(function () {
            vm._clueImagesTimer = setInterval(async function () {
              try {
                await tryFetchAndUpdate();
              } catch (_) {}
            }, longInterval);
          });
        } catch (_) {}
      } else {
        vm.currentVisit = [];
      }

      vm.$nextTick(function () {
        if (vm.$refs.visitModeSelect) vm.$refs.visitModeSelect.focus();
      });
    } catch (e) {
      console.error('openDetail error', e);
      vm.showMsg('无法加载详情', 'error');
    }
  }

  function closeDetail(vm) {
    vm.showDetail = false;
    vm.currentDetail = {};
    vm.currentVisit = [];
    vm.revisitVisitContent = '';
    vm.refundEditing = false;
    vm.refundErrors = {};
    vm.refundDraft = { refundAmount: '', refundReason: '' };
    try {
      vm.revisitDraftId = null;
    } catch (_) {}
    try {
      if (vm._clueImagesTimer) {
        clearInterval(vm._clueImagesTimer);
        vm._clueImagesTimer = null;
      }
    } catch (_) {}
  }

  global.ClueDetailModule = {
    saveDetailEdits: saveDetailEdits,
    openDetail: openDetail,
    closeDetail: closeDetail,
  };
})(window);
