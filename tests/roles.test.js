import { test, assertEqual } from './harness.js';
import { isAdmin, canEditTxn } from '../js/roles.js';
import { backupReminderDays } from '../js/calc.js';

const admin = { id: 'k', name: 'Kelvin', role: 'admin' };
const member = { id: 'v', name: 'Vincent', role: 'member' };

test('isAdmin', () => {
  assertEqual(isAdmin(admin), true);
  assertEqual(isAdmin(member), false);
  assertEqual(isAdmin(null), false);
});

test('canEditTxn: members edit only their own, unreimbursed entries', () => {
  assertEqual(canEditTxn({ created_by: 'v', reimbursed_on: null }, member), true);
  assertEqual(canEditTxn({ created_by: 'k', reimbursed_on: null }, member), false);
  assertEqual(canEditTxn({ created_by: 'v', reimbursed_on: '2026-10-03' }, member), false);
  assertEqual(canEditTxn({ created_by: 'v', reimbursed_on: '2026-10-03' }, admin), true);
  assertEqual(canEditTxn({ created_by: null, reimbursed_on: null }, admin), true);
});

test('backup reminder follows the admin role, not the name', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  assertEqual(backupReminderDays({ last_backup_at: null }, { name: 'Someone', role: 'admin' }, now), Infinity);
  assertEqual(backupReminderDays({ last_backup_at: null }, { name: 'Kelvin', role: 'member' }, now), null);
});
