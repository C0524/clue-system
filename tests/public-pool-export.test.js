const assert = require('node:assert/strict');
const { buildPublicPoolExportPayload, buildPublicPoolExportRows } = require('../assets/js/public-pool-export-utils.js');

const payload = buildPublicPoolExportPayload({ id: '123', channel: '抖音', timeType: 'createTime' });
assert.equal(payload.page, 1);
assert.equal(payload.pageSize, 5000);
assert.equal(payload.id, '123');
assert.equal(payload.channel, '抖音');
assert.equal(payload.timeType, 'createTime');

const visitsByClue = {
  1: [
    { clueId: 1, time: '2026-10-04 10:00:00', user: '王五', content: '已确认' }
  ]
};

const rows = buildPublicPoolExportRows([
  {
    id: 1,
    createTime: '2026-10-01 09:00:00',
    assignedAt: '2026-10-02 09:00:00',
    taoRen: '张三',
    channel: '抖音',
    name: '李四',
    gender: '男',
    age: 28,
    phone: '13800000000',
    wechat: 'wx123',
    doctor: '赵医生',
    regDoctor: '赵医生',
    assignedTo: '王五',
    intent: '有效',
    visitStatus: '1访',
    bookUser: '用户A',
    book: '已预约',
    bookTime: '2026-10-03 09:00:00'
  }
], visitsByClue);

assert.equal(rows[0][0], 1);
assert.equal(rows[0][1], '2026-10-01 09:00:00');
assert.equal(rows[0][14], '1访');
assert.equal(rows[0][15], '用户A');
assert.equal(rows[0][18], '2026-10-04 10:00:00 王五：已确认');

const workbook = require('../assets/js/public-pool-export-utils.js').buildPublicPoolExportWorkbook([
  {
    id: 1,
    name: '李四',
    createTime: '2026-10-01 09:00:00',
    assignedAt: '2026-10-02 09:00:00',
    channel: '抖音'
  }
], visitsByClue);
assert.equal(workbook.sheets[0].name, '话单筛选导出');
assert.equal(workbook.sheets[0].rows[0][0], 1);
assert.equal(workbook.sheets[0].rows[0][18], '2026-10-04 10:00:00 王五：已确认');
