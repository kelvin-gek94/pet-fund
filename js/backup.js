// "Back up now": one zip with every table (data.json) and every receipt photo.
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
import { state, refresh, toast } from './app.js';
import * as db from './db.js';
import { todayMY } from './dates.js';

export const BACKUP_SCHEMA_VERSION = 1;

export async function buildBackupZip(onStep = () => {}) {
  onStep('reading data');
  const tables = await db.exportTables();
  const zip = new JSZip();
  zip.file('data.json', JSON.stringify({
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    tables,
  }, null, 2));

  onStep('fetching receipts');
  const paths = [...new Set(tables.transactions.map(t => t.receipt_path).filter(Boolean))];
  const failed = [];
  let receiptCount = 0;
  for (const path of paths) {
    try {
      const res = await fetch(await db.receiptUrl(path));
      if (!res.ok) throw new Error(res.status);
      zip.file(`receipts/${path}`, await res.blob());
      receiptCount += 1;
    } catch {
      failed.push(path);
    }
  }
  onStep('building zip');
  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, filename: `pet-fund-backup-${todayMY()}.zip`, receiptCount, failed };
}

export async function runBackup() {
  let step = 'starting';
  toast('Preparing backup…');
  try {
    const { blob, filename, receiptCount, failed } = await buildBackupZip(s => { step = s; });
    // Record the backup BEFORE downloading: on iPhone the download sheet takes over the page
    // and cancels any request still in flight ("Load failed").
    step = 'saving backup record';
    await db.saveSettings({ last_backup_at: new Date().toISOString(), last_backup_by: state.me.id });
    step = 'reloading';
    await refresh();
    step = 'downloading';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    toast(failed.length
      ? `Backup saved, but ${failed.length} receipt(s) couldn't be included`
      : `Backup saved (${receiptCount} receipt${receiptCount === 1 ? '' : 's'})`);
  } catch (ex) {
    toast(`Backup failed while ${step}: ${ex.message}`, 10000);
  }
}
