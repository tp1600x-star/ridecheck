/**
 * RideCheck Auto-Learning Loop — Gated Calibration Release Runner
 *
 * วงจรเรียนรู้อัตโนมัติแบบ Self-Healing:
 *   1. ฝึกโมเดลใหม่จาก data/calibration.csv ด้วย Least Squares (calibrate.js)
 *   2. เทียบ MAPE ใหม่กับพารามิเตอร์ที่ใช้งานจริงอยู่ตอนนี้
 *   3. เฉพาะ "ดีขึ้น" เท่านั้นที่ถูกปล่อย (RELEASE) — ถ้าแย่ลงจะถูก ROLLBACK ทันที
 *   4. ผลการตัดสินใจถูกบันทึกลง logs/calibration-gate.json ให้ CI รายงานได้
 *
 * หลัก Deterministic: ไม่มี Math.random() — input เดิม ผลลัพธ์ gate เดิมเป๊ะ
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_JSON_PATH = path.join(ROOT_DIR, 'data', 'calibrated-parameters.json');
const GATE_LOG_PATH = path.join(ROOT_DIR, 'logs', 'calibration-gate.json');

// เกณฑ์คุณภาพ: MAPE ต้องต่ำกว่า 15% (มาตรฐาน QA ของโปรเจกต์)
const MAX_ALLOWED_MAPE = 15.0;
// ค่าคลาดเคลื่อนที่ยอมรับได้โดยไม่ถือว่า "แย่ลง" (กันสัญญาณรบกวนจากรอบเศษทศนิยม)
const MAPE_TOLERANCE = 0.05;

/**
 * Pure function ตัดสินใจปล่อยหรือ rollback พารามิเตอร์ชุดใหม่
 * @param {Object} oldData - พารามิเตอร์ชุดปัจจุบันที่ใช้งานอยู่
 * @param {Object} newData - พารามิเตอร์ชุดใหม่จากการฝึกล่าสุด
 * @returns {{release: boolean, reason: string, oldMape: number|null, newMape: number|null}}
 */
function evaluateRelease(oldData, newData) {
    const oldMape = oldData && oldData.metrics ? Number(oldData.metrics.overallMAPE) : null;
    const newMape = newData && newData.metrics ? Number(newData.metrics.overallMAPE) : null;

    if (newMape === null || isNaN(newMape)) {
        return { release: false, reason: 'NEW_METRICS_MISSING: ชุดพารามิเตอร์ใหม่ไม่มีค่า MAPE ที่ใช้ได้', oldMape, newMape };
    }

    if (newMape >= MAX_ALLOWED_MAPE) {
        return {
            release: false,
            reason: `QA_GATE: MAPE ใหม่ ${newMape}% ไม่ผ่านเกณฑ์ (< ${MAX_ALLOWED_MAPE}%) — ROLLBACK 保住พารามิเตอร์เดิม`,
            oldMape, newMape
        };
    }

    if (oldMape === null || isNaN(oldMape)) {
        return { release: true, reason: `FIRST_RUN: ไม่มีพารามิเตอร์เดิมเทียบ — ปล่อยชุดแรก (MAPE ${newMape}%)`, oldMape, newMape };
    }

    // เทียบพารามิเตอร์ว่าเปลี่ยนจริงไหม (ไม่นับเฉพาะ timestamp)
    const paramsIdentical = JSON.stringify(oldData.parameters) === JSON.stringify(newData.parameters);
    if (paramsIdentical) {
        return { release: false, reason: `NO_CHANGE: ค่าพารามิเตอร์ไม่เปลี่ยนจากชุดเดิม (MAPE ${newMape}%) — ข้ามการ commit เพื่อไม่ให้เกิด timestamp churn`, oldMape, newMape };
    }

    if (newMape > oldMape + MAPE_TOLERANCE) {
        return {
            release: false,
            reason: `REGRESSION: MAPE แย่ลงจาก ${oldMape}% -> ${newMape}% — ROLLBACK อัตโนมัติ ใช้พารามิเตอร์เดิมต่อ`,
            oldMape, newMape
        };
    }

    return {
        release: true,
        reason: `IMPROVED: MAPE ปรับปรุง ${oldMape}% -> ${newMape}% (ลดลง ${(oldMape - newMape).toFixed(2)}%) — ปล่อยสู่ Production`,
        oldMape, newMape
    };
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * รัน Auto-Calibration แบบมี Gate (โหมด dryRun = ไม่เขียนไฟล์จริง)
 */
function runAutoCalibrate({ dryRun = false } = {}) {
    const calibrate = require('./calibrate.js');

    // 1. เก็บชุดพารามิเตอร์ปัจจุบันไว้เป็น fallback
    let oldData = null;
    let oldRaw = null;
    try {
        oldRaw = fs.readFileSync(OUTPUT_JSON_PATH, 'utf8');
        oldData = JSON.parse(oldRaw);
    } catch (e) {
        oldData = null;
    }

    // 2. ฝึกโมเดลใหม่จาก calibration.csv (เขียนไฟล์ใหม่)
    const newData = calibrate.runCalibration();

    // 3. Gate: ตัดสินใจปล่อยหรือ rollback
    const decision = evaluateRelease(oldData, newData);

    if (!decision.release) {
        // ROLLBACK: คืนค่าพารามิเตอร์เดิมทั้งหมด (เว้นแต่ dryRun)
        if (!dryRun && oldRaw !== null) {
            fs.writeFileSync(OUTPUT_JSON_PATH, oldRaw, 'utf8');
        }
        console.log(`⛔ [Gate] ROLLBACK — ${decision.reason}`);
    } else {
        console.log(`✅ [Gate] RELEASE — ${decision.reason}`);
    }

    // 4. บันทึกผล gate ให้ CI อ่านรายงาน
    try {
        const logsDir = path.join(ROOT_DIR, 'logs');
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
        fs.writeFileSync(GATE_LOG_PATH, JSON.stringify({
            release: decision.release,
            reason: decision.reason,
            oldMape: decision.oldMape,
            newMape: decision.newMape,
            sampleCount: newData ? newData.totalSampleCount : 0,
            evaluatedAt: new Date().toISOString()
        }, null, 2), 'utf8');
    } catch (e) {}

    return decision;
}

if (require.main === module) {
    const dryRun = process.argv.includes('--dry-run');
    const decision = runAutoCalibrate({ dryRun });
    process.exitCode = 0; // gate จัดการเองแล้ว — CI ใช้ผลจาก git diff + calibration-gate.json
}

module.exports = {
    evaluateRelease,
    runAutoCalibrate,
    MAX_ALLOWED_MAPE,
    MAPE_TOLERANCE
};
