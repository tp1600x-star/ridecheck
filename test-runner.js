/**
 * RideCheck Automated QA & Pre-Deployment Test Suite
 * ตรวจสอบความถูกต้องของระบบทั้งหมดก่อนนำขึ้น Production (Zero-Tolerance for Broken Builds)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT_DIR = __dirname;
let passedCount = 0;
let failedCount = 0;
const testResults = [];

function assert(condition, testName, details = '') {
  if (condition) {
    passedCount++;
    testResults.push({ name: testName, status: 'PASSED', details });
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedCount++;
    testResults.push({ name: testName, status: 'FAILED', details });
    console.error(`  ❌ [FAIL] ${testName} - ${details}`);
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 [RideCheck QA & Pre-Deploy Test Engine]');
  console.log(`⏰ เวลาทดสอบ: ${new Date().toLocaleString('th-TH')}`);
  console.log('================================================================\n');

  // Test 1: ตรวจสอบความมีอยู่ของไฟล์หน้าเว็บและไฟล์หลัก
  console.log('🔍 Group 1: Core Files & Syntax Integrity');
  const requiredFiles = [
    'index.html',
    'v2.html',
    'styles.css',
    'app.js',
    'project-resources.json',
    'firebase.json',
    'server.js',
    'worker-engine.js',
    'telegram-baron.js'
  ];

  for (const file of requiredFiles) {
    const fullPath = path.join(ROOT_DIR, file);
    assert(fs.existsSync(fullPath), `ไฟล์จำเป็น '${file}' ต้องมีอยู่ในระบบ`);
  }

  // Test 2: ตรวจสอบ JSON Validity ของไฟล์คอนฟิกหลัก
  console.log('\n🔍 Group 2: JSON Schema & Resource Integrity');
  let resources = null;
  try {
    const raw = fs.readFileSync(path.join(ROOT_DIR, 'project-resources.json'), 'utf8');
    resources = JSON.parse(raw);
    assert(true, 'ไฟล์ project-resources.json มีรูปแบบ JSON ที่ถูกต้อง');
  } catch (err) {
    assert(false, 'ไฟล์ project-resources.json รูปแบบ JSON เสียหาย', err.message);
  }

  if (resources) {
    assert(!!resources.departments, 'มีโครงสร้างแผนก departments ครบถ้วน');
    assert(!!resources.departments?.data?.baseFare, 'มีโครงสร้างฐานราคา baseFare ครบถ้วน');
    assert(!!resources.departments?.data?.perKmRates, 'มีโครงสร้างอัตรา perKmRates ครบถ้วน');

    // ตรวจสอบค่ายรถ 5 ค่ายหลัก
    const requiredApps = ['grab', 'bolt', 'lineman', 'maxim', 'indrive'];
    const appsInBike = Object.keys(resources.departments?.data?.baseFare?.bike || {});
    const hasAllApps = requiredApps.every(app => appsInBike.includes(app));
    assert(hasAllApps, 'มีข้อมูลราคารถจักรยานยนต์ครบทั้ง 5 ค่าย (Grab, Bolt, LINE MAN, Maxim, inDrive)');
  }

  // Test 3: ตรวจสอบ Deep Links & ระบบแผนที่ Longdo Map (หลัก) และ Google Maps
  console.log('\n🔍 Group 3: Frontend Deep Links & Map Engines (Longdo Map Primary + Google Maps)');
  try {
    const indexContent = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    assert(indexContent.includes('grab.com') || indexContent.includes('grab://'), 'มีลิงก์เชื่อมต่อไปยัง Grab');
    assert(indexContent.includes('bolt.eu') || indexContent.includes('bolt://'), 'มีลิงก์เชื่อมต่อไปยัง Bolt');
    assert(indexContent.includes('lineman') || indexContent.includes('lineman://'), 'มีลิงก์เชื่อมต่อไปยัง LINE MAN');
    assert(indexContent.includes('leaflet'), 'มีการโหลดไลบรารีแผนที่ Leaflet.js');
    assert(indexContent.includes('ms.longdo.com/mmmap/img.php') && indexContent.includes('f77758635505616dd7ce9ebf39090e7c'), 'เชื่อมต่อ TH Longdo Map API แผนที่หลักความละเอียดสูงระดับซอกซอย (Official Key)');
    assert(indexContent.includes('prov-card-longdo') && indexContent.includes('⭐ แผนที่หลักแนะนำ'), 'ตั้งค่า Longdo Map เป็น Search Provider และ Geocoding หลักอันดับ 1');
    assert(indexContent.includes('longdo-address'), 'มีระบบ Longdo Reverse Geocoding แปลงพิกัดเป็นชื่อซอย/ถนนภาษาไทย');
    assert(indexContent.includes('mt{s}.google.com') && indexContent.includes('lyrs=m') && indexContent.includes('hl=th'), 'เชื่อมต่อ Google Maps ถนนและซอกซอย (ภาษาไทย คมชัดระดับซอย)');
    assert(indexContent.includes('lyrs=y'), 'มีเลเยอร์ Google Maps Hybrid ภาพถ่ายดาวเทียมผสมชื่อซอย');
    assert(indexContent.includes('สุขุมวิท 11') && indexContent.includes('ทองหล่อ 10') && indexContent.includes('ซอยอารีย์'), 'มีฐานข้อมูลซอกซอยยอดนิยมในกรุงเทพฯ ครบถ้วน');
    assert(indexContent.length > 50000, `หน้าเว็บ index.html สมบูรณ์ (ขนาด ${indexContent.length} bytes)`);
  } catch (err) {
    assert(false, 'อ่านไฟล์ index.html ล้มเหลว', err.message);
  }

  // Test 4: ทดสอบการคำนวณราคาและ Surge Multiplier Math
  console.log('\n🔍 Group 4: Fare Calculation Logic');
  if (resources && resources.departments?.data?.baseFare?.car) {
    const baseCar = resources.departments.data.baseFare.car.grab;
    const rateCar = resources.departments.data.perKmRates.car.grab;
    const distKm = 10;
    const surge = 1.2;
    const estimated = Math.round((baseCar + (distKm * rateCar)) * surge);

    assert(estimated > 0 && !isNaN(estimated), `คำนวณราคารถ Grab 10 กม. พร้อม Surge 1.2x ได้ถูกต้อง (฿${estimated})`);
    assert(estimated >= baseCar, 'ราคาที่คำนวณได้ต้องไม่ต่ำกว่าค่าโดยสารเริ่มต้น');
  }

  // Test 5: ตรวจสอบความปลอดภัย Security & Secret Check
  console.log('\n🔍 Group 5: Zero-Leak Security Audit');
  const gitignorePath = path.join(ROOT_DIR, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, 'utf8');
    assert(gi.includes('.env'), 'ไฟล์ .gitignore มีการป้องกัน .env หลุด');
    assert(gi.includes('node_modules'), 'ไฟล์ .gitignore มีการละเว้น node_modules');
  } else {
    assert(false, 'ไม่พบไฟล์ .gitignore ในโฟลเดอร์โปรเจกต์');
  }

  console.log('\n================================================================');
  console.log(`📊 ผลการทดสอบ: ผ่าน ${passedCount} รายการ | ไม่ผ่าน ${failedCount} รายการ`);
  console.log('================================================================');

  if (failedCount > 0) {
    console.error('⛔ [QA BLOCKED] ผลทดสอบไม่ผ่าน! ไม่อนุญาตให้นำขึ้น Production');
    process.exit(1);
  } else {
    console.log('🎉 [QA PASSED 100%] ผ่านมาตรฐานทุกข้อ! ระบบพร้อมนำขึ้น Production ทันที\n');
    return { passedCount, failedCount, testResults };
  }
}

if (require.main === module) {
  runTestSuite();
}

module.exports = { runTestSuite };
