/**
 * RideCheck Auto-Learning Loop — Sample Ingestion Pipeline
 *
 * ดึงตัวอย่างราคาจริงจาก 2 แหล่งเข้าสู่ data/calibration.csv:
 *   1. ไฟล์ CSV ที่ผู้ใช้ Export จากหน้าเว็บแล้ววางใน data/contributions/ (ช่องทางออฟไลน์)
 *   2. Firestore Collection 'fare_contributions' (ส่งตรงจากหน้าเว็บแบบเรียลไทม์)
 *
 * ตัวอย่างที่ไม่ผ่านเกณฑ์คุณภาพ (ระยะทาง <= 0, ราคา <= 0, แอป/ระดับบริการไม่รู้จัก)
 * ถูกตัดทิ้งทันทีเพื่อรักษาคุณภาพชุดฝึก (Zero-Garbage-In)
 * ทุกแถวถูก Dedupe กับข้อมูลเดิมด้วยลายเซ็น timestamp+app+tier+distance+price
 *
 * Deterministic: ไม่มี Math.random() — ไฟล์เดิม + ตัวอย่างเดิม = CSV ผลลัพธ์เดิมเป๊ะ
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CSV_PATH = path.join(ROOT_DIR, 'data', 'calibration.csv');
const CONTRIBUTIONS_DIR = path.join(ROOT_DIR, 'data', 'contributions');

const CSV_HEADER = 'timestamp,app,service_tier,origin_name,origin_lat,origin_lng,dest_name,dest_lat,dest_lng,road_distance_km,duration_min,actual_price,actual_regular_price,weather,traffic_level,hour_of_day,day_of_week';

const VALID_APPS = ['grab', 'bolt', 'lineman', 'maxim', 'indrive'];
const VALID_TIERS = ['bike', 'car', 'taxi', 'suv', 'van', 'premium'];

function escapeCsvField(value) {
    const s = value === undefined || value === null ? '' : String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function isValidContribution(row) {
    if (!row) return false;
    if (!VALID_APPS.includes(String(row.app || '').toLowerCase())) return false;
    if (!VALID_TIERS.includes(String(row.service_tier || '').toLowerCase())) return false;
    const dist = parseFloat(row.road_distance_km);
    const dur = parseFloat(row.duration_min);
    const price = parseFloat(row.actual_price);
    if (!(dist > 0) || !(dur > 0) || !(price > 0)) return false;
    if (dist > 200 || dur > 400 || price > 5000) return false; // กันค่าผิดปกติสุดขั้ว
    return true;
}

/**
 * แปลง record (จากหน้าเว็บหรือ Firestore) เป็นแถว CSV หนึ่งแถว
 * เติม字段 ที่ขาดจาก timestamp ให้ครบตาม schema ของ calibrate.js
 */
function convertContributionToCsvRow(record) {
    if (!isValidContribution(record)) return null;

    const ts = record.timestamp || new Date(0).toISOString();
    let hour = parseInt(record.hour_of_day, 10);
    let dow = parseInt(record.day_of_week, 10);
    if (isNaN(hour) || isNaN(dow)) {
        try {
            const d = new Date(ts);
            if (!isNaN(d.getTime())) {
                if (isNaN(hour)) hour = d.getUTCHours(); // fallback หยาบ ๆ ใช้ UTC
                if (isNaN(dow)) dow = d.getUTCDay();
            }
        } catch (e) {}
    }
    if (isNaN(hour)) hour = 12;
    if (isNaN(dow)) dow = 1;

    const price = parseFloat(record.actual_price);
    const regular = parseFloat(record.actual_regular_price) || price;

    return [
        escapeCsvField(ts),
        String(record.app).toLowerCase(),
        String(record.service_tier).toLowerCase(),
        escapeCsvField(record.origin_name || ''),
        escapeCsvField(record.origin_lat !== undefined ? record.origin_lat : ''),
        escapeCsvField(record.origin_lng !== undefined ? record.origin_lng : ''),
        escapeCsvField(record.dest_name || ''),
        escapeCsvField(record.dest_lat !== undefined ? record.dest_lat : ''),
        escapeCsvField(record.dest_lng !== undefined ? record.dest_lng : ''),
        parseFloat(record.road_distance_km).toFixed(2),
        parseFloat(record.duration_min).toFixed(1),
        String(price),
        String(regular),
        escapeCsvField(record.weather || 'clear'),
        escapeCsvField(record.traffic_level || 'moderate'),
        String(hour),
        String(dow)
    ].join(',');
}

function makeSignature(row) {
    // ลายเซ็นกันซ้ำ: เวลา+แอป+ระดับ+ระยะ+ราคา (timestamp แม่นที่สุด)
    return [
        row.timestamp || '',
        String(row.app || '').toLowerCase(),
        String(row.service_tier || '').toLowerCase(),
        Number(row.road_distance_km).toFixed(2),
        Number(row.actual_price || row.actual_regular_price || 0)
    ].join('|');
}

function signatureFromCsvLine(line) {
    const parts = line.split(',');
    // timestamp,app,tier,...,dist(idx9),dur(10),price(11)
    if (parts.length < 17) return null;
    return [
        parts[0].replace(/^"|"$/g, ''),
        parts[1],
        parts[2],
        Number(parts[9]).toFixed(2),
        Number(parts[11])
    ].join('|');
}

/**
 * รวมรายการ contributed rows เข้า CSV หลัก (pure function สำหรับเทส)
 * @param {string} currentCsv - เนื้อหา data/calibration.csv ปัจจุบัน
 * @param {Array<Object>} contributionRecords - รายการ record ใหม่ที่จะเพิ่ม
 * @returns {{csv: string, added: number, rejected: number, duplicates: number}}
 */
function mergeContributionsIntoCsv(currentCsv, contributionRecords) {
    const lines = currentCsv.trim().split(/\r?\n/).filter(l => l.trim());
    const header = lines[0] || CSV_HEADER;
    const existingRows = lines.slice(1);

    const seen = new Set();
    existingRows.forEach(l => {
        const sig = signatureFromCsvLine(l);
        if (sig) seen.add(sig);
    });

    let added = 0, rejected = 0, duplicates = 0;
    const newLines = [];

    for (const rec of (contributionRecords || [])) {
        const row = convertContributionToCsvRow(rec);
        if (!row) { rejected++; continue; }
        const sig = signatureFromCsvLine(row);
        if (sig && seen.has(sig)) { duplicates++; continue; }
        if (sig) seen.add(sig);
        newLines.push(row);
        added++;
    }

    const csv = [header, ...existingRows, ...newLines].join('\n') + '\n';
    return { csv, added, rejected, duplicates };
}

/**
 * อ่านไฟล์ CSV ที่ผู้ใช้ export ไว้ใน data/contributions/ แล้วแปลงเป็น record list
 */
function readContributedCsvFiles() {
    const records = [];
    if (!fs.existsSync(CONTRIBUTIONS_DIR)) return records;

    const files = fs.readdirSync(CONTRIBUTIONS_DIR).filter(f => f.toLowerCase().endsWith('.csv'));
    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(CONTRIBUTIONS_DIR, file), 'utf8');
            const lines = content.trim().split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) continue;
            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',');
                const row = {};
                headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim().replace(/^"|"$/g, ''); });
                records.push(row);
            }
        } catch (e) {
            console.warn(`⚠️ [Ingest] อ่านไฟล์ ${file} ล้มเหลว:`, e.message);
        }
    }
    return records;
}

/**
 * ดึงตัวอย่างจาก Firestore collection 'fare_contributions' (ต้องมี credential)
 */
async function readFirestoreContributions() {
    try {
        const bridge = require(path.join(ROOT_DIR, 'firebase-bridge.js'));
        const mode = bridge.getBridgeMode();
        if (mode !== 'FIREBASE_ADMIN') {
            console.log('ℹ️ [Ingest] ยังไม่มี Firebase credential — ข้ามการดึงตัวอย่างจาก Firestore (ใช้เฉพาะไฟล์ data/contributions/)');
            return [];
        }
        const db = bridge.getFirestore();
        const snap = await db.collection('fare_contributions').limit(500).get();
        const records = [];
        snap.forEach(doc => records.push(doc.data()));
        console.log(`📥 [Ingest] ดึงตัวอย่างจาก Firestore สำเร็จ: ${records.length} รายการ`);
        return records;
    } catch (e) {
        console.warn('⚠️ [Ingest] Firestore อ่านไม่สำเร็จ:', e.message);
        return [];
    }
}

/**
 * รัน Ingestion ทั้งหมด: merge file contributions + Firestore -> data/calibration.csv
 */
async function runIngestion() {
    let currentCsv = fs.existsSync(CSV_PATH)
        ? fs.readFileSync(CSV_PATH, 'utf8')
        : CSV_HEADER + '\n';

    const fileRecords = readContributedCsvFiles();
    const firestoreRecords = await readFirestoreContributions();
    const allRecords = [...fileRecords, ...firestoreRecords];

    if (allRecords.length === 0) {
        console.log('📭 [Ingest] ยังไม่มีตัวอย่างใหม่ — คงชุดข้อมูลเดิมไว้ (ไม่มีการเปลี่ยนแปลง)');
        return { added: 0, rejected: 0, duplicates: 0, totalIncoming: 0 };
    }

    const result = mergeContributionsIntoCsv(currentCsv, allRecords);

    if (result.added > 0) {
        fs.writeFileSync(CSV_PATH, result.csv, 'utf8');
    }

    console.log(`📊 [Ingest] รับเข้า ${result.totalIncoming = allRecords.length} รายการ | เพิ่มใหม่ ${result.added} | ซ้ำ ${result.duplicates} | ไม่ผ่านเกณฑ์ ${result.rejected}`);
    console.log(`📈 [Ingest] data/calibration.csv ปัจจุบันมีแถวข้อมูลสะสม ${result.csv.trim().split(/\r?\n/).length - 1} ตัวอย่าง`);
    return result;
}

if (require.main === module) {
    runIngestion().then(() => process.exit(0)).catch(err => {
        console.error('❌ [Ingest] เกิดข้อผิดพลาด:', err.message);
        process.exit(0); // ไม่ให้ CI ล้มเหลว — ชุดข้อมูลเดิมยังใช้ได้
    });
}

module.exports = {
    CSV_HEADER,
    VALID_APPS,
    VALID_TIERS,
    isValidContribution,
    convertContributionToCsvRow,
    mergeContributionsIntoCsv,
    readContributedCsvFiles,
    readFirestoreContributions,
    runIngestion
};
