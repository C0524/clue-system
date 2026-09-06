const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('super admin keeps selected taoRen value when saving edit', () => {
  const modulePath = path.join(__dirname, '..', 'assets', 'js', 'modules', 'clue-edit-module.js');
  const source = fs.readFileSync(modulePath, 'utf8');
  const sandbox = {
    window: {},
    global: {},
    console,
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  vm.runInContext(source, vm.createContext(sandbox));
  const moduleApi = sandbox.ClueEditModule;
  assert.ok(moduleApi && typeof moduleApi.resolveTaoRenForEdit === 'function');
  assert.equal(moduleApi.resolveTaoRenForEdit({ role: '超级管理员', username: 'admin' }, '张三'), '张三');
  assert.equal(moduleApi.resolveTaoRenForEdit({ role: '咨询', username: 'alice' }, '张三'), 'alice');
});
