const ALLOWED_CLUE_UPDATE_KEYS = new Set([
  'channel', 'name', 'gender', 'age', 'phone', 'wechat', 'doctor', 'department',
  'regDoctor', 'taoRen',
  'intent', 'visitStatus', 'bookUser', 'book', 'arrive', 'medicineDay', 'dosageForm',
  'cost', 'regFee', 'treatmentFee', 'refundAmount', 'refundReason', 'visitMode', 'visitDate', 'createTime', 'content',
  'preCase'
]);

module.exports = {
  ALLOWED_CLUE_UPDATE_KEYS,
};
