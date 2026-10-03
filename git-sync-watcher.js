/**
 * RideCheck - Automated Git Sync & Watcher Engine
 * Automatically commits and pushes all changes/deploys to https://github.com/tp1600x-star/ridecheck
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = __dirname;
const REMOTE_URL = 'https://github.com/tp1600x-star/ridecheck.git';
const BRANCH = 'main';

// Ignore patterns for directory watching
const IGNORED_PATHS = [
  '.git',
  'node_modules',
  '.cache',
  'logs',
  'npm-debug.log',
  '.env',
  'subscribers.json'
];

function runCommand(command, options = {}) {
  try {
    const output = execSync(command, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stdout: error.stdout ? error.stdout.toString() : '',
      stderr: error.stderr ? error.stderr.toString() : ''
    };
  }
}

function runGitCommand(args) {
  try {
    const output = execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stdout: error.stdout ? error.stdout.toString() : '',
      stderr: error.stderr ? error.stderr.toString() : ''
    };
  }
}

function syncToGitHub(customMessage = null) {
  console.log(`\n======================================================`);
  console.log(`🚀 [Git-Sync] เริ่มต้นการตรวจสอบและซิงก์โปรเจกต์สู่ GitHub...`);
  console.log(`⏰ เวลา: ${new Date().toLocaleString('th-TH')}`);
  console.log(`======================================================`);

  // 1. ตรวจสอบสถานะการเปลี่ยนแปลง
  const statusRes = runCommand('git status --porcelain');
  if (!statusRes.success) {
    console.error(`❌ ไม่สามารถเรียกดู git status ได้:`, statusRes.stderr);
    return { success: false, message: statusRes.stderr };
  }

  const statusText = statusRes.output.trim();
  if (!statusText) {
    console.log(`✅ [Git-Sync] ไม่มีไฟล์เปลี่ยนแปลง (Working tree clean) ทุกอย่างตรงกับ GitHub แล้ว`);
    return { success: true, message: 'Working tree clean, already up to date.' };
  }

  console.log(`📁 พบไฟล์ที่มีการเปลี่ยนแปลง:\n${statusText}`);

  // 2. Stage All Changes
  console.log(`📦 กำลังทำ git add -A...`);
  const addRes = runCommand('git add -A');
  if (!addRes.success) {
    console.error(`❌ เกิดข้อผิดพลาดในการ git add:`, addRes.stderr);
    return { success: false, message: addRes.stderr };
  }

  // 3. Commit
  const commitMsg = customMessage || `chore(auto-sync): update RideCheck project - ${new Date().toISOString()}`;
  console.log(`📝 กำลังทำ git commit: "${commitMsg}"...`);
  const commitRes = runGitCommand(['commit', '-m', commitMsg]);
  if (!commitRes.success) {
    console.error(`❌ เกิดข้อผิดพลาดในการ commit:`, commitRes.stderr);
    return { success: false, message: commitRes.stderr };
  }
  console.log(`✅ Commit สำเร็จ:\n${commitRes.output}`);

  // 4. Pull Rebase เพื่อป้องกันข้อขัดแย้ง
  console.log(`🔄 ตรวจสอบการอัปเดตจากรีโมต (git pull --rebase origin ${BRANCH})...`);
  const pullRes = runCommand(`git pull --rebase origin ${BRANCH}`);
  if (!pullRes.success) {
    console.error(`❌ Rebase ไม่สำเร็จ ยกเลิกการ push เพื่อไม่ให้เกิดประวัติที่ขัดแย้ง:`, pullRes.stderr);
    return { success: false, message: pullRes.stderr };
  }

  // 5. Push ไปยัง GitHub
  console.log(`🚀 กำลังอัปโหลดไปยัง https://github.com/tp1600x-star/ridecheck...`);
  const pushRes = runCommand(`git push origin ${BRANCH}`);
  if (!pushRes.success) {
    console.error(`❌ เกิดข้อผิดพลาดในการ git push:`, pushRes.stderr);
    return { success: false, message: pushRes.stderr };
  }

  console.log(`🎉 [Git-Sync] อัปโหลดเข้า GitHub สำเร็จ 100%!`);
  console.log(`🔗 ดูโค้ดล่าสุดได้ที่: https://github.com/tp1600x-star/ridecheck`);
  return { success: true, message: 'Pushed to GitHub successfully' };
}

// ตรวจสอบ argument: ถ้าระบุ --once หรือมี custom message จะทำงานรอบเดียวแล้วจบ
const args = process.argv.slice(2);
const isOnce = args.includes('--once') || args.some(a => a.startsWith('-m='));
const msgArg = args.find(a => a.startsWith('-m='))?.replace('-m=', '');

if (isOnce) {
  const result = syncToGitHub(msgArg);
  process.exit(result.success ? 0 : 1);
} else {
  // รันแบบ Watcher ตรวจจับการเปลี่ยนแปลงไฟล์อัตโนมัติ
  console.log(`👀 [Git-Sync Watcher] เปิดโหมดเฝ้าดูการเปลี่ยนแปลงไฟล์ในโฟลเดอร์ RideCheck...`);
  console.log(`💡 ทุกครั้งที่ท่านแก้ไขหรือบันทึกไฟล์ ระบบจะรอ 5 วินาทีแล้ว Git Commit & Push ให้อัตโนมัติ`);
  console.log(`🛑 กด Ctrl + C เพื่อหยุดการทำงาน\n`);

  let debounceTimer = null;

  fs.watch(REPO_ROOT, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    // ข้ามไฟล์ที่ไม่เกี่ยวข้อง
    const isIgnored = IGNORED_PATHS.some(p => filename.startsWith(p) || filename.includes(path.sep + p));
    if (isIgnored) return;

    console.log(`⚡ ตรวจพบการเปลี่ยนแปลงใน: ${filename}`);

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`⏳ ครบระยะหน่วงเวลา 5 วินาที กำลังซิงก์ไฟล์ขึ้น GitHub...`);
      syncToGitHub(`chore(auto-sync): save changes in ${filename} - ${new Date().toLocaleTimeString('th-TH')}`);
    }, 5000);
  });
}
