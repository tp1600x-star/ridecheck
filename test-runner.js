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
    'fare-model.js',
    'moto-router.js',
    'data/moto-restrictions.geojson',
    'tests/fixtures/routes.json',
    'routing/motorcycle.lua',
    'routing/docker-compose.valhalla.yml',
    'docs/routing.md',
    'data/calibration.csv',
    'scripts/calibrate.js',
    'data/calibrated-parameters.json',
    'surge-engine.js',
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

  // Test 4: ทดสอบ Universal Fare Model และความแม่นยำ Deterministic 100%
  console.log('\n🔍 Group 4: Universal Fare Model & Deterministic Architecture');
  let FareModel = null;
  try {
    FareModel = require(path.join(ROOT_DIR, 'fare-model.js'));
    assert(typeof FareModel.estimateFare === 'function', 'fare-model.js มีฟังก์ชัน estimateFare');
    assert(typeof FareModel.estimateRideFare === 'function', 'fare-model.js มีฟังก์ชัน estimateRideFare');
    assert(typeof FareModel.calcTaxiMeter === 'function', 'fare-model.js มีฟังก์ชัน calcTaxiMeter ตาม พ.ร.บ. คมนาคม 2566');
    assert(typeof FareModel.getBangkokTimeInfo === 'function', 'fare-model.js มีฟังก์ชันคำนวณเวลา Asia/Bangkok');
  } catch (err) {
    assert(false, 'โหลดโมดูล fare-model.js ล้มเหลว', err.message);
  }

  if (FareModel) {
    // 4.1 Zero Math.random() Spy Test
    let randomCalls = 0;
    const originalRandom = Math.random;
    Math.random = () => { randomCalls++; return 0.5; };
    try {
      FareModel.estimateRideFare(12.5, 25, 'car', 1.0);
      FareModel.estimateFare({ app: 'grab', vehicleType: 'bike', distanceKm: 5, durationMin: 12 });
      FareModel.estimateFare({ app: 'bolt', vehicleType: 'bike', distanceKm: 5, durationMin: 12 });
      FareModel.estimateFare({ app: 'indrive', vehicleType: 'car', distanceKm: 15, durationMin: 35 });
      assert(randomCalls === 0, `ไม่มีการเรียกใช้ Math.random() ในการคำนวณราคาหรือเวลารอ (สุ่มไป ${randomCalls} ครั้ง)`);
    } finally {
      Math.random = originalRandom;
    }

    // 4.2 100-Iteration Deterministic Stability Test
    const sampleInput = { app: 'grab', vehicleType: 'bike', distanceKm: 8.4, durationMin: 22, surgeMultiplier: 1.15 };
    const firstRun = JSON.stringify(FareModel.estimateFare(sampleInput));
    let isDeterministic = true;
    for (let i = 0; i < 100; i++) {
      const run = JSON.stringify(FareModel.estimateFare(sampleInput));
      if (run !== firstRun) {
        isDeterministic = false;
        break;
      }
    }
    assert(isDeterministic, 'เรียกคำนวณราคาซ้ำ 100 ครั้งด้วย input เดียวกัน ได้ค่าตรงกันเป๊ะ 100% (Pure Deterministic)');

    // 4.3 Fictitious Discount Removal Test (Honest Price before Discount)
    const grabBike = FareModel.estimateFare({ app: 'grab', vehicleType: 'bike', distanceKm: 5.0, durationMin: 15.0 });
    const boltBike = FareModel.estimateFare({ app: 'bolt', vehicleType: 'bike', distanceKm: 5.0, durationMin: 15.0 });
    assert(grabBike.price === grabBike.regularPrice, `Grab คำนวณราคาเต็มปกติ ไม่หักส่วนลด Saver สมมติ (฿${grabBike.price})`);
    assert(boltBike.price === boltBike.regularPrice, `Bolt คำนวณราคาเต็มปกติ ไม่หักโปรโมชัน 25% สมมติ (฿${boltBike.price})`);
    assert(grabBike.breakdown.regularPrice === grabBike.mid, 'โครงสร้างราคาตรงกับราคากลางที่แสดงผล');

    // 4.4 inDrive Passenger Bidding Range Test (-15% to +18%)
    const inDriveCar = FareModel.estimateFare({ app: 'indrive', vehicleType: 'car', distanceKm: 10.0, durationMin: 25.0 });
    const expectedLow = Math.max(inDriveCar.breakdown.baseFare, Math.round(inDriveCar.mid * 0.85));
    const expectedHigh = Math.round(inDriveCar.mid * 1.18);
    assert(inDriveCar.low === expectedLow, `inDrive ขอบล่างช่วงราคาคือ -15% (฿${inDriveCar.low})`);
    assert(inDriveCar.high === expectedHigh, `inDrive ขอบบนช่วงราคาคือ +18% (฿${inDriveCar.high})`);
    assert(inDriveCar.subPriceNote.includes('ผู้โดยสารเสนอราคาเอง'), 'inDrive ระบุชัดเจนว่าผู้โดยสารเสนอราคาเอง');

    // 4.5 Standard Return Schema Integrity Test
    const requiredKeys = ['low', 'mid', 'high', 'breakdown', 'confidence', 'modelVersion', 'calibratedAt', 'sampleCount', 'coverageLevel'];
    const hasAllKeys = requiredKeys.every(k => k in grabBike);
    assert(hasAllKeys, 'ผลลัพธ์ estimateFare มีคีย์มาตรฐานครบถ้วน (low, mid, high, breakdown, confidence, modelVersion, calibratedAt, sampleCount, coverageLevel)');
    assert(grabBike.modelVersion === '1.0.0-uncalibrated', 'modelVersion ระบุ 1.0.0-uncalibrated');
    assert(grabBike.calibratedAt === null, 'calibratedAt เป็น null (รอสอบเทียบในขั้นที่ 3)');
    assert(grabBike.sampleCount === 0, 'sampleCount เป็น 0 (รอเก็บตัวอย่างจริง)');

    // 4.6 Timezone Asia/Bangkok Verification
    const timeInfo = FareModel.getBangkokTimeInfo(new Date('2026-10-01T12:00:00Z'));
    assert(timeInfo.hour === 19, `แปลงเวลาเป็น Timezone Asia/Bangkok ถูกต้อง (UTC 12:00 -> BKK ${timeInfo.hour}:00)`);

    // 4.7 Batch App Estimation (estimateRideFare)
    const allApps = FareModel.estimateRideFare(7.0, 18.0, 'car');
    assert(Array.isArray(allApps) && allApps.length === 5, 'estimateRideFare คืนค่าผลลัพธ์ครบทั้ง 5 ค่ายรถ');
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

  // Test 6: ระบบนำทางมอเตอร์ไซค์และการเลี่ยงสิ่งกีดขวาง (Part A: Motorcycle Routing & Restrictions)
  console.log('\n🔍 Group 6: Motorcycle Routing Engine & Restriction Enforcement');
  let MotoRouter = null;
  try {
    MotoRouter = require(path.join(ROOT_DIR, 'moto-router.js'));
    assert(typeof MotoRouter.getMotoRoute === 'function', 'moto-router.js มีฟังก์ชัน getMotoRoute');
    assert(typeof MotoRouter.calcHaversineDistance === 'function', 'moto-router.js มีฟังก์ชัน calcHaversineDistance');
    assert(Array.isArray(MotoRouter.OFFICIAL_RESTRICTIONS), 'moto-router.js มีรายการ OFFICIAL_RESTRICTIONS ฝังในตัว');
  } catch (err) {
    assert(false, 'โหลดโมดูล moto-router.js ล้มเหลว', err.message);
  }

  // 6.1 GeoJSON Restrictions Database Integrity
  let geojsonData = null;
  try {
    const rawGeo = fs.readFileSync(path.join(ROOT_DIR, 'data', 'moto-restrictions.geojson'), 'utf8');
    geojsonData = JSON.parse(rawGeo);
    assert(geojsonData.type === 'FeatureCollection', 'data/moto-restrictions.geojson มี type เป็น FeatureCollection');
    assert(Array.isArray(geojsonData.features) && geojsonData.features.length >= 10, `มีรายการข้อห้ามรถจักรยานยนต์อย่างน้อย 10 จุดสำคัญ (พบ ${geojsonData.features?.length} จุด)`);

    const authorities = new Set(geojsonData.features.map(f => f.properties?.authority));
    const allHaveUrl = geojsonData.features.every(f => typeof f.properties?.source_url === 'string' && f.properties.source_url.startsWith('http'));
    const allActive = geojsonData.features.every(f => f.properties?.status === 'active');
    assert(allHaveUrl, 'ทุกรายการข้อห้ามมี URL แหล่งข้อมูลอ้างอิงทางราชการ (source_url)');
    assert(allActive, 'ทุกรายการข้อห้ามมีสถานะพร้อมใช้งาน (status = active)');
    assert(authorities.has('การทางพิเศษแห่งประเทศไทย (EXAT)') || authorities.has('EXAT'), 'มีข้อบังคับจากการทางพิเศษแห่งประเทศไทย (EXAT)');
    assert(authorities.has('กรมทางหลวง (DOH)') || authorities.has('DOH'), 'มีกฎกระทรวงจากกรมทางหลวง (DOH)');
  } catch (err) {
    assert(false, 'ตรวจสอบไฟล์ data/moto-restrictions.geojson ล้มเหลว', err.message);
  }

  // 6.2 Multi-Region Test Fixtures
  let fixturesData = null;
  try {
    const rawFix = fs.readFileSync(path.join(ROOT_DIR, 'tests', 'fixtures', 'routes.json'), 'utf8');
    fixturesData = JSON.parse(rawFix);
    assert(Array.isArray(fixturesData.fixtures) && fixturesData.fixtures.length >= 5, `มีชุดทดสอบครอบคลุมหลายภูมิภาคอย่างน้อย 5 เส้นทาง (พบ ${fixturesData.fixtures?.length} ชุด)`);
  } catch (err) {
    assert(false, 'ตรวจสอบไฟล์ tests/fixtures/routes.json ล้มเหลว', err.message);
  }

  if (MotoRouter && fixturesData) {
    // 6.3 Fixture 1: Bangkok Bhumibol Bridge Avoidance (Part A1)
    const f1 = fixturesData.fixtures.find(f => f.id === 'bkk-bhumibol-avoidance');
    if (f1) {
      const res1 = await MotoRouter.getMotoRoute(f1.origin, f1.dest);
      assert(res1.moto_feasible === 'yes', 'เส้นทางบางนา-พระราม 2 สามารถเดินทางด้วยมอเตอร์ไซค์ได้ (moto_feasible = yes)');
      assert(res1.distance_km > res1.car_distance_km, `เส้นทางมอเตอร์ไซค์มีการอ้อมเลี่ยงสะพานภูมิพล (ระยะมอไซค์ ${res1.distance_km} กม. > รถยนต์ ${res1.car_distance_km} กม.)`);
      assert(res1.detour_ratio > 1.10, `detour_ratio สูงกว่า 1.10 สะท้อนระยะทางจริง (${res1.detour_ratio})`);
      const avoidedBhumibol = res1.avoided_restrictions.some(r => (r.name || r).includes('ภูมิพล'));
      assert(avoidedBhumibol, 'ผลลัพธ์ระบุการเลี่ยงสะพานภูมิพลใน avoided_restrictions');
    }

    // 6.4 Fixture 2: Bangkok Motorway 7 Avoidance
    const f2 = fixturesData.fixtures.find(f => f.id === 'bkk-motorway7-avoidance');
    if (f2) {
      const res2 = await MotoRouter.getMotoRoute(f2.origin, f2.dest);
      assert(res2.moto_feasible === 'yes', 'เส้นทางพระราม 9-สุวรรณภูมิ มอเตอร์ไซค์สัญจรได้ (moto_feasible = yes)');
      const avoidedM7 = res2.avoided_restrictions.some(r => (r.name || r).includes('หมายเลข 7'));
      assert(avoidedM7, 'ผลลัพธ์ระบุการเลี่ยงทางหลวงพิเศษหมายเลข 7 (มอเตอร์เวย์) ใน avoided_restrictions');
    }

    // 6.5 Fixture 3: Expressway-Only Infeasible Route (Part A1 / A5)
    const f3 = fixturesData.fixtures.find(f => f.id === 'expressway-only-infeasible');
    if (f3) {
      const res3 = await MotoRouter.getMotoRoute(f3.origin, f3.dest);
      assert(res3.moto_feasible === 'no', 'จุดบนทางพิเศษยกระดับตรวจพบว่ามอเตอร์ไซค์วิ่งไม่ได้ (moto_feasible = no)');
      assert(res3.distance_km === null, 'เส้นทางที่เป็นไปไม่ได้ไม่คืนระยะทางมอเตอร์ไซค์ (distance_km = null)');
      assert(res3.warnings.length > 0, 'มีข้อความเตือนผู้ใช้ให้เลือกใช้รถยนต์หรือแท็กซี่แทน');
    }

    // 6.6 Fixture 4 & 5: Regional Tests (Chiang Mai & Phuket)
    const f4 = fixturesData.fixtures.find(f => f.id === 'chiangmai-urban-to-suburb');
    const f5 = fixturesData.fixtures.find(f => f.id === 'phuket-mountain-pass');
    if (f4 && f5) {
      const res4 = await MotoRouter.getMotoRoute(f4.origin, f4.dest);
      const res5 = await MotoRouter.getMotoRoute(f5.origin, f5.dest);
      assert(res4.moto_feasible === 'yes' && res4.distance_km > 0, `ทดสอบเชียงใหม่สำเร็จ (ระยะทาง ${res4.distance_km} กม.)`);
      assert(res5.moto_feasible === 'yes' && res5.distance_km > 0, `ทดสอบภูเก็ตสำเร็จ (ระยะทาง ${res5.distance_km} กม.)`);
    }

    // 6.7 Offline / Fallback Integrity Test (Part A2)
    const fFallback = fixturesData.fixtures[0];
    const resFallback = await MotoRouter.getMotoRoute(fFallback.origin, fFallback.dest, { forceOffline: true });
    assert(resFallback.moto_feasible === 'unknown', 'เมื่อเซิร์ฟเวอร์นำทางออฟไลน์ ต้องคืน moto_feasible = unknown (ห้ามโกหกว่า verified)');
    assert(resFallback.confidence === 'low', 'เมื่อ fallback ต้องระบุ confidence = low');
    assert(resFallback.provider.includes('fallback'), 'provider ระบุว่าเป็น fallback engine');
  }

  // Test 7: ระบบสอบเทียบราคาจริงและการคำนวณพารามิเตอร์ (Step 3: Calibration Engine)
  console.log('\n🔍 Group 7: Empirical Calibration & Parameter Fitting Engine');
  let calibRecords = null;
  const calibrateModule = require(path.join(ROOT_DIR, 'scripts', 'calibrate.js'));
  assert(typeof calibrateModule.runCalibration === 'function', 'scripts/calibrate.js มีฟังก์ชัน runCalibration');

  try {
    const rawCSV = fs.readFileSync(path.join(ROOT_DIR, 'data', 'calibration.csv'), 'utf8');
    calibRecords = calibrateModule.parseCSV(rawCSV);
    assert(Array.isArray(calibRecords) && calibRecords.length >= 30, `มีชุดข้อมูลตัวอย่างจริงอย่างน้อย 30 รายการ (พบ ${calibRecords?.length} รายการ)`);
  } catch (err) {
    assert(false, 'อ่านไฟล์ data/calibration.csv ล้มเหลว', err.message);
  }

  if (calibRecords) {
    // 7.1 Field coverage in CSV
    const sampleRecord = calibRecords[0];
    const requiredCSVFields = ['app', 'serviceTier', 'distanceKm', 'durationMin', 'actualPrice', 'actualRegularPrice'];
    const hasAllFields = requiredCSVFields.every(f => f in sampleRecord && sampleRecord[f] !== undefined);
    assert(hasAllFields, 'ข้อมูล calibration.csv มีคอลัมน์สำคัญครบถ้วน');

    // 7.2 Read calibrated parameters JSON
    let calibParams = null;
    try {
      const rawParams = fs.readFileSync(path.join(ROOT_DIR, 'data', 'calibrated-parameters.json'), 'utf8');
      calibParams = JSON.parse(rawParams);
      assert(calibParams.modelVersion === '1.1.0-calibrated', 'calibrated-parameters.json ระบุ modelVersion เป็น 1.1.0-calibrated');
      assert(calibParams.metrics?.overallMAPE < 15.0, `ค่า Overall MAPE ต่ำกว่า 15% ตามเกณฑ์ความแม่นยำ (วัดได้ ${calibParams.metrics?.overallMAPE}%)`);
      assert(calibParams.metrics?.overallMAE < 15.0, `ค่า Overall MAE อยู่ในเกณฑ์มาตรฐาน (วัดได้ ฿${calibParams.metrics?.overallMAE})`);
      assert(calibParams.totalSampleCount >= 30, `บันทึก sample count ครบถ้วน (${calibParams.totalSampleCount} samples)`);
    } catch (err) {
      assert(false, 'ตรวจสอบไฟล์ data/calibrated-parameters.json ล้มเหลว', err.message);
    }

    // 7.3 Test FareModel Integration with Calibrated Parameters
    if (calibParams && FareModel) {
      FareModel.applyCalibration(calibParams);
      assert(FareModel.isCalibrated() === true, 'FareModel เปิดใช้งานสถานะ Calibrated สำเร็จ');
      
      const status = FareModel.getCalibrationStatus();
      assert(status.modelVersion === '1.1.0-calibrated', 'FareModel สถานะรายงาน modelVersion = 1.1.0-calibrated');
      assert(status.sampleCount >= 30, `FareModel รายงาน sampleCount = ${status.sampleCount}`);

      // Verify empirical measurements from prompt:
      // Grab Bike 4.8 km / 14 min -> actual regular price 63, display 59
      const grabCalib = FareModel.estimateFare({ app: 'grab', vehicleType: 'bike', distanceKm: 4.8, durationMin: 14.0 });
      assert(grabCalib.price >= 55 && grabCalib.price <= 68, `Grab Bike 4.8km คำนวณได้ตรงช่วงจริง ฿55-68 (คำนวณได้ ฿${grabCalib.price})`);
      assert(grabCalib.confidence === 'high', 'ค่า confidence ของโมเดลที่สอบเทียบแล้วคือ high');

      // Bolt Bike 4.8 km / 14 min -> actual regular price 53, display 49
      const boltCalib = FareModel.estimateFare({ app: 'bolt', vehicleType: 'bike', distanceKm: 4.8, durationMin: 14.0 });
      assert(boltCalib.price >= 45 && boltCalib.price <= 58, `Bolt Bike 4.8km คำนวณได้ตรงช่วงจริง ฿45-58 (คำนวณได้ ฿${boltCalib.price})`);

      // Clean rollback test
      FareModel.resetCalibration();
      assert(FareModel.isCalibrated() === false, 'FareModel สามารถ resetCalibration คืนสู่ prior baseline ได้อย่างปลอดภัย');
    }
  }

  // Test 8: ระบบคำนวณราคาพุ่งตามอุปสงค์และสภาพอากาศ (Step 4: Dynamic Surge Engine & Weather Fallback)
  console.log('\n🔍 Group 8: Dynamic Surge Engine & Weather Fallback (Specification A6)');
  let SurgeEngine = null;
  try {
    SurgeEngine = require(path.join(ROOT_DIR, 'surge-engine.js'));
    assert(typeof SurgeEngine.getSurgeMultiplier === 'function', 'surge-engine.js มีฟังก์ชัน getSurgeMultiplier');
    assert(typeof SurgeEngine.calculateTimeBaseline === 'function', 'surge-engine.js มีฟังก์ชัน calculateTimeBaseline');
    assert(typeof SurgeEngine.calculateAppSurge === 'function', 'surge-engine.js มีฟังก์ชัน calculateAppSurge');
  } catch (err) {
    assert(false, 'โหลดโมดูล surge-engine.js ล้มเหลว', err.message);
  }

  if (SurgeEngine) {
    // 8.1 Peak-hour determinism: Weekday Morning Peak (08:15 BKK)
    const morningPeakTime = new Date('2026-10-01T01:15:00Z'); // UTC 01:15 = BKK 08:15 (Thursday)
    const morningBaseline = SurgeEngine.calculateTimeBaseline(SurgeEngine.getBangkokTime(morningPeakTime));
    assert(morningBaseline.isPeakHour === true, 'เวลา 08:15 น. วันทำงาน ตรวจจับเป็นช่วงเวลาเร่งด่วน (isPeakHour = true)');
    assert(morningBaseline.multiplier >= 1.25, `ตัวคูณช่วงเร่งด่วนเช้ามากกว่าหรือเท่ากับ 1.25x (คำนวณได้ ${morningBaseline.multiplier}x)`);

    // 8.2 Peak-hour determinism: Weekday Evening Peak (18:30 BKK)
    const eveningPeakTime = new Date('2026-10-01T11:30:00Z'); // UTC 11:30 = BKK 18:30 (Thursday)
    const eveningBaseline = SurgeEngine.calculateTimeBaseline(SurgeEngine.getBangkokTime(eveningPeakTime));
    assert(eveningBaseline.isPeakHour === true, 'เวลา 18:30 น. วันทำงาน ตรวจจับเป็นช่วงเวลาเร่งด่วนเย็น (isPeakHour = true)');
    assert(eveningBaseline.multiplier >= 1.30, `ตัวคูณช่วงเร่งด่วนเย็นมากกว่าหรือเท่ากับ 1.30x (คำนวณได้ ${eveningBaseline.multiplier}x)`);

    // 8.3 Off-peak baseline: Midday Tuesday (14:30 BKK)
    const offPeakTime = new Date('2026-09-29T07:30:00Z'); // UTC 07:30 = BKK 14:30 (Tuesday)
    const offPeakBaseline = SurgeEngine.calculateTimeBaseline(SurgeEngine.getBangkokTime(offPeakTime));
    assert(offPeakBaseline.isPeakHour === false, 'เวลา 14:30 น. เป็นเวลานอกชั่วโมงเร่งด่วน (isPeakHour = false)');
    assert(offPeakBaseline.multiplier === 1.0, `เวลานอกชั่วโมงเร่งด่วนมีตัวคูณพื้นฐานเป็น 1.0x (${offPeakBaseline.multiplier}x)`);

    // 8.4 Weather surge impact: Heavy thunderstorm simulation
    const rainSurgeRes = await SurgeEngine.getSurgeMultiplier(13.7563, 100.5018, {
      time: offPeakTime,
      weatherOverride: {
        isRaining: true,
        rainMm: 15.0,
        weatherCode: 95,
        weatherDescription: 'พายุฝนฟ้าคะนอง',
        rainSeverity: 'heavy'
      }
    });
    assert(rainSurgeRes.overallMultiplier >= 1.30, `พายุฝนทำให้เกิด Surge เพิ่มขึ้นอย่างน้อย 0.30x (คำนวณได้ ${rainSurgeRes.overallMultiplier}x)`);
    assert(rainSurgeRes.reasons.some(r => r.includes('พายุ') || r.includes('ฝน')), 'มีเหตุผลระบุเรื่องสภาพอากาศใน reasons');

    // 8.5 App-Specific Surge Sensitivity Check
    const appSurges = SurgeEngine.calculateAppSurge(1.50);
    assert(appSurges.grab > appSurges.lineman, `Grab มีความไวต่อ Surge สูงกว่า LINE MAN (Grab: ${appSurges.grab}x, LINE MAN: ${appSurges.lineman}x)`);
    assert(appSurges.lineman > appSurges.maxim, `LINE MAN มี Surge สูงกว่า Maxim ที่ราคาคงที่กว่า (LINE MAN: ${appSurges.lineman}x, Maxim: ${appSurges.maxim}x)`);
    assert(appSurges.indrive === 1.0, 'inDrive ตัวคูณระบบคงที่ 1.0x (ราคาขึ้นกับช่วงเสนอราคาของผู้โดยสาร)');

    // 8.6 Offline Fallback Graceful Handling
    const offlineSurge = await SurgeEngine.getSurgeMultiplier(13.7563, 100.5018, { forceOffline: true, time: morningPeakTime });
    assert(offlineSurge.confidence === 'medium', 'เมื่อออฟไลน์ รายงาน confidence = medium');
    assert(offlineSurge.provider === 'historical-time-baseline', 'เมื่อออฟไลน์ ใช้ provider = historical-time-baseline');
    assert(offlineSurge.overallMultiplier > 1.0, 'เมื่อออฟไลน์ ยังคงคำนวณตัวคูณตามสถิติเวลาเร่งด่วนได้ถูกต้อง');
  }

  // Test 9: ระบบรับข้อมูลร่วมพัฒนาจากชุมชนและความโปร่งใส (Step 5: Frontend Community Data Contribution)
  console.log('\n🔍 Group 9: Frontend Community Data Contribution & Transparency UI');
  try {
    const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const v2Html = fs.readFileSync(path.join(ROOT_DIR, 'v2.html'), 'utf8');

    assert(indexHtml.includes('surge-engine.js'), 'index.html มีการโหลดโมดูล surge-engine.js');
    assert(indexHtml.includes('id="contribute-fare-modal"'), 'index.html มีโมดอล contribute-fare-modal สำหรับรับข้อมูลราคาจริง');
    assert(indexHtml.includes('openContributeModal') && indexHtml.includes('submitFareContribution'), 'index.html มีฟังก์ชันเปิดและส่งข้อมูลราคาจริง');
    assert(indexHtml.includes('exportContributionsCSV'), 'index.html มีฟังก์ชัน Export CSV สำหรับส่ง PR ไปยัง GitHub');
    assert(indexHtml.includes('initCalibrationAndSurge'), 'index.html มีฟังก์ชันเริ่มต้น calibration และ surge เมื่อโหลด');

    assert(v2Html.includes('surge-engine.js'), 'v2.html มีการโหลดโมดูล surge-engine.js');
    assert(v2Html.includes('id="contribute-fare-modal"'), 'v2.html มีโมดอล contribute-fare-modal สำหรับรับข้อมูลราคาจริง');
    assert(v2Html.includes('openContributeModal') && v2Html.includes('submitFareContribution'), 'v2.html มีฟังก์ชันเปิดและส่งข้อมูลราคาจริง');
    assert(v2Html.includes('exportContributionsCSV'), 'v2.html มีฟังก์ชัน Export CSV สำหรับส่ง PR ไปยัง GitHub');
    assert(v2Html.includes('initCalibrationAndSurge'), 'v2.html มีฟังก์ชันเริ่มต้น calibration และ surge เมื่อโหลด');
  } catch (err) {
    assert(false, 'ตรวจสอบ Group 9 ล้มเหลว', err.message);
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
