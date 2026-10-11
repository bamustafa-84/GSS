'use strict';
const test = require('node:test');
const assert = require('node:assert');
const rbac = require('./rbac');

test('token round trip, tamper and expiry', () => {
  const t = rbac.signToken({ id: 7, name: 'ann', role: 'Instructor' });
  assert.deepStrictEqual(rbac.verifyToken(t), { id: 7, name: 'ann', role: 'Instructor' });
  assert.strictEqual(rbac.verifyToken(t.slice(0, -2) + 'xx'), null);
  assert.strictEqual(rbac.verifyToken('garbage'), null);
  assert.strictEqual(rbac.verifyToken(t, Date.now() + 13 * 3600 * 1000), null);
});

test('resolver denies by default and never infers from view', () => {
  const perms = { '1.1': { view: true }, '5.1': { view: true, edit: true } };
  assert.strictEqual(rbac.can(perms, '1.1', 'view'), true);
  assert.strictEqual(rbac.can(perms, '1.1', 'edit'), false);
  assert.strictEqual(rbac.can(perms, '1.2', 'view'), false);
  assert.strictEqual(rbac.can(perms, '1.1', 'export'), false);
  assert.strictEqual(rbac.can(null, '1.1', 'view'), false);
});

test('column to section mapping', () => {
  const m = rbac.sectionForColumn;
  assert.strictEqual(m('full_name'), '1.1');
  assert.strictEqual(m('interview_result'), '1.2');
  assert.strictEqual(m('ack_conditions'), '2.1');
  assert.strictEqual(m('ack_rules'), '3.1');
  assert.strictEqual(m('ack_commitment'), '4.1');
  assert.strictEqual(m('ack_presences'), '5.1');
  assert.strictEqual(m('exam_score'), '6.1');
  assert.strictEqual(m('eval_presence_discipline'), '7.1');
  assert.strictEqual(m('eval_final_decision'), '7.2');
  assert.strictEqual(m('updated_by'), null);
  assert.strictEqual(m('ack_dossier'), '9.1');
  assert.strictEqual(m('ack_mensuration'), '8.1');
});

test('save requirements use add for insert and edit for update', () => {
  assert.deepStrictEqual(rbac.requirementsForSave(['full_name', 'eval_final_decision'], true),
    [{ section: '1.1', action: 'edit' }, { section: '7.2', action: 'edit' }]);
  assert.deepStrictEqual(rbac.requirementsForSave(['full_name'], false), [{ section: '1.1', action: 'add' }]);
});