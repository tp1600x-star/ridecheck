# 🚖 RideCheck Thailand — Open Source Smart Ride Price Comparison Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests: 121/121 Passed](https://img.shields.io/badge/QA%20Tests-121%2F121%20Passed%20(100%25)-brightgreen.svg)](test-runner.js)
[![Model Version](https://img.shields.io/badge/Model%20Version-v1.1.0--calibrated-purple.svg)](data/calibrated-parameters.json)
[![Accuracy: MAPE 12.2%](https://img.shields.io/badge/Accuracy-MAPE%2012.2%25%20%7C%20MAE%20%E0%B8%BF11.97-blueviolet.svg)](data/calibrated-parameters.json)
[![Router](https://img.shields.io/badge/Motorcycle%20Router-Legal%20%26%20Detour%20Aware-emerald.svg)](docs/routing.md)
[![Platform: Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

**RideCheck Thailand** เป็นแพลตฟอร์มเปรียบเทียบราคาเรียกรถโดยสารออนไลน์แบบเรียลไทม์ (Ride-Hailing Comparison Engine) ตัวแรกที่สร้างขึ้นเพื่อผู้บริโภคชาวไทย โดยรวบรวมและเปรียบเทียบค่าโดยสารระหว่าง **Grab, Bolt, LINE MAN, inDrive, Maxim** ภายใต้มาตรฐานความโปร่งใสระดับสูงสุด (Zero-Scam, Zero-Random, Pure Deterministic Math) พร้อมระบบนำทางสำหรับรถจักรยานยนต์ที่คำนึงถึงข้อห้ามตามกฎหมายจราจรไทยอย่างแท้จริง

---

## 🧭 พันธกิจและความโปร่งใส (Core Principles & Transparency)

1. **🚫 ไม่มีสุ่มราคา (Zero `Math.random()`)**:
   ทุกตัวเลขราคาและเวลารอรถคำนวณจากสูตรคณิตศาสตร์บริสุทธิ์ (Pure Deterministic Functions) และพิกัดถนนจริงเท่านั้น เรียกคำนวณซ้ำ 1,000 ครั้งด้วย input เดียวกัน ย่อมได้ผลลัพธ์ตรงกันเป๊ะ 100%
2. **🏷️ ปลดส่วนลดโปรโมชันสมมติ (Honest Display Price)**:
   ราคาที่แสดงต่อผู้ใช้คือ **ราคาเต็มปกติ (Regular Price)** ไม่มีการหักลบโปรโมชันหลอกตา (เช่น Grab Saver -18% หรือ Bolt Promo -25%) เพื่อให้ราคาประมาณการตรงกับบิลจริงที่ผู้โดยสารต้องจ่าย
3. **🤝 ช่วงราคาต่อรองของ inDrive (-15% ถึง +18%)**:
   inDrive ใช้โมเดลการประมูลราคาโดยผู้โดยสาร ระบบแสดงช่วงราคาแนะนำที่คนขับมีโอกาสรับงานจริง พร้อมระบุข้อความชัดเจน
4. **🛵 ระบบเส้นทางมอเตอร์ไซค์ถูกกฎหมาย (Legal Motorcycle Routing)**:
   ไม่ใช้ระยะทางรถยนต์มาคิดราคามอเตอร์ไซค์อีกต่อไป ระบบตรวจจับและเลี่ยงสะพานภูมิพล, มอเตอร์เวย์สาย 7/9, ทางด่วนยกระดับ และอุโมงค์ต้องห้ามตามประกาศราชกิจจานุเบกษา
5. **⚡ Dynamic Surge ตามอุปสงค์และสภาพอากาศจริง**:
   เชื่อมต่อ API สภาพอากาศ Open-Meteo แบบสด พร้อม fallback ตามสถิติชั่วโมงเร่งด่วนของประเทศไทยอย่างโปร่งใส

---

## 🌟 ฟีเจอร์หลักของระบบ (System Highlights)

### 1. Universal Fare Calculation Engine ([`fare-model.js`](fare-model.js))
- โครงสร้างโมดูลมาตรฐาน UMD (รองรับทั้ง Browser `window.FareModel` และ Node.js `require`)
- คืนค่า Schema ครบถ้วน: `low`, `mid`, `high`, `breakdown`, `confidence`, `modelVersion`, `calibratedAt`, `sampleCount`, `coverageLevel`
- คำนวณค่าแท็กซี่มิเตอร์ตามประกาศกฎกระทรวงคมนาคม พ.ศ. 2566
- รองรับการโหลดชุดพารามิเตอร์ที่ผ่านการสอบเทียบ (`FareModel.applyCalibration(...)`)

### 2. Motorcycle Routing & Restriction Engine ([`moto-router.js`](moto-router.js))
- ตรวจสอบความถูกต้องตามกฎหมาย:
  - **ห้ามขึ้นสะพานภูมิพล 1–2**: ตามข้อบังคับ บช.น. และกรมทางหลวงชนบท (กระแสลมแรงเสี่ยงอุบัติเหตุ) $\rightarrow$ อ้อมไปใช้แพขนานยนต์หรือถนนพระราม 3
  - **ห้ามเข้ามอเตอร์เวย์สาย 7 และสาย 9**: ตามกฎกระทรวงคมนาคม $\rightarrow$ อ้อมไปใช้ทางคู่ขนาน Frontage Road หรือถนนกิ่งแก้ว
  - **ทางพิเศษยกระดับล้วน**: รายงาน `moto_feasible: "no"` พร้อมเตือนให้เลือกใช้รถยนต์
- ฐานข้อมูลข้อห้ามราชการในรูปแบบ GeoJSON ([`data/moto-restrictions.geojson`](data/moto-restrictions.geojson))
- สถาปัตยกรรมเซิร์ฟเวอร์นำทาง Valhalla + OSRM Custom Profile ([`docs/routing.md`](docs/routing.md))

### 3. Empirical Model Calibration Engine ([`scripts/calibrate.js`](scripts/calibrate.js))
- วิเคราะห์ข้อมูลราคาที่เก็บได้จริงจากแอปเรียกรถในประเทศไทย ([`data/calibration.csv`](data/calibration.csv))
- ใช้วิธี **Ridge Regularization (Tikhonov Least Squares)** ป้องกันปัญหา Collinearity ระหว่างระยะทางและเวลา
- คำนวณค่าพารามิเตอร์ต่อค่ายรถและส่งออกเป็น [`data/calibrated-parameters.json`](data/calibrated-parameters.json)
- ผลลัพธ์ความแม่นยำปัจจุบัน:
  - **Overall MAPE**: `12.17%` (เกณฑ์มาตรฐาน: < 15.0%)
  - **Overall MAE**: `฿11.97`
  - **Band Coverage**: `55.6%`

### 4. Dynamic Surge & Weather Engine ([`surge-engine.js`](surge-engine.js))
- เชื่อมต่อ Open-Meteo API ตรวจวัดปริมาณฝน (มม./ชม.) และ WMO Weather Code
- วิเคราะห์ชั่วโมงเร่งด่วนวันทำงานเช้า (07:00-09:30) และเย็น (17:00-20:00) พร้อมช่วงเที่ยงคืนวันหยุดสุดสัปดาห์
- จำแนกความไวต่อ Surge ตามแต่ละค่าย (Grab/Bolt ตอบสนองเร็ว, Maxim อัตราคงที่กว่า, inDrive เปิดให้ผู้โดยสารเสนอราคา)
- มี Offline Baseline รองรับกรณีเครือข่ายขัดข้องโดยไม่ทำให้ระบบหยุดชะงัก

### 5. Community Crowdsource Data Contribution Form
- หน้าเว็บ [`index.html`](index.html) และ [`v2.html`](v2.html) มีฟอร์มให้ชุมชนช่วยส่งข้อมูลราคาจริงที่พบจากแอป
- บันทึกลง `localStorage` และ Firestore เพื่อนำมาคำนวณ Re-calibration
- มีปุ่ม **Export CSV** สำหรับนำข้อมูลไปเปิด Pull Request บน GitHub

---

## 🏗️ โครงสร้างไฟล์ในโปรเจกต์ (Project Structure)

```text
RideCheck/
├── .github/
│   ├── workflows/
│   │   ├── auto-calibrate.yml       # รันสอบเทียบโมเดลอัตโนมัติทุกสัปดาห์ (Sunday 18:00 UTC)
│   │   └── bot-runner.yml           # CI/CD & Deploy Pipeline
│   └── ISSUE_TEMPLATE/
│       └── moto-restriction-report.yml # แม่แบบแจ้งจุดห้ามมอเตอร์ไซค์
├── data/
│   ├── calibration.csv              # ชุดข้อมูลการเดินทางจริง 36+ ตัวอย่าง
│   ├── calibrated-parameters.json   # พารามิเตอร์ราคาหลังสอบเทียบ (MAPE 12.17%)
│   └── moto-restrictions.geojson   # พิกัด 12 จุดห้ามมอเตอร์ไซค์ตามกฎหมายไทย
├── docs/
│   └── routing.md                   # คู่มือเปรียบเทียบและติดตั้ง Valhalla / OSRM
├── routing/
│   ├── docker-compose.valhalla.yml  # Docker Container Setup สำหรับ Valhalla Router
│   └── motorcycle.lua               # OSRM Custom Profile สำหรับมอเตอร์ไซค์ไทย (110-150cc)
├── scripts/
│   └── calibrate.js                 # สคริปต์ Multivariate Linear Regression Fit
├── tests/
│   └── fixtures/
│       └── routes.json              # Multi-Region Test Fixtures (กทม., เชียงใหม่, ภูเก็ต)
├── app.js                           # Frontend Core Logic
├── fare-model.js                    # Universal Pricing Model (Deterministic)
├── moto-router.js                   # Motorcycle Routing & Restriction Engine
├── surge-engine.js                  # Dynamic Surge & Weather Engine
├── index.html                       # Production Web App (Longdo Map + Google Maps)
├── v2.html                          # Next-Gen Dual-Pane Web App
├── test-runner.js                   # Automated Pre-Deploy Quality Gate (121 Tests)
├── LICENSE                          # MIT License
└── package.json
```

---

## 🚀 เริ่มต้นใช้งานและทดสอบ (Getting Started)

### 1. ความต้องการของระบบ (Prerequisites)
- [Node.js](https://nodejs.org/) v20 หรือใหม่กว่า
- Git

### 2. ติดตั้ง Dependencies
```bash
git clone https://github.com/tp1600x-star/ridecheck.git
cd ridecheck
npm install
```

### 3. รันระบบทดสอบคุณภาพ (QA Test Runner)
```bash
npm test
```
ผลลัพธ์จะทำการตรวจสอบทั้ง 9 กลุ่มการทดสอบ (121 รายการ):
- Syntax Integrity & Core Files
- JSON Schema & Metadata
- Longdo & Google Maps Geocoding
- Universal Fare Model Determinism
- Zero-Leak Security Audit
- Motorcycle Routing & Restrictions Avoidance
- Empirical Calibration & Parameter Fitting
- Dynamic Surge & Weather Fallback
- Frontend Community Contribution & Transparency UI

### 4. รันการสอบเทียบโมเดลราคาด้วยตนเอง (Manual Calibration)
```bash
node scripts/calibrate.js
```

---

## 🤝 ร่วมพัฒนาโปรเจกต์ (Contributing)

RideCheck เป็นโครงการ Open Source 100% ทุกท่านสามารถมีส่วนร่วมได้ดังนี้:
1. **แจ้งราคาจริงที่พบจากแอป**: ผ่านฟอร์ม "ส่งข้อมูลราคา" บนหน้าเว็บ หรือส่ง PR เพิ่มแถวใน [`data/calibration.csv`](data/calibration.csv)
2. **แจ้งจุดห้ามมอเตอร์ไซค์เพิ่มเติม**: เปิด Issue ผ่าน [Moto Restriction Template](.github/ISSUE_TEMPLATE/moto-restriction-report.yml) พร้อมแนบประกาศราชกิจจานุเบกษาหรือข้อบังคับตำรวจ
3. **พัฒนาอัลกอริทึม Routing / ML**: เสนอการปรับปรุงสคริปต์ Least Squares หรือ OSRM Lua Profile

---

## 📄 สัญญาอนุญาต (License)

โปรเจกต์นี้เผยแพร่ภายใต้สัญญาอนุญาต **[MIT License](LICENSE)** สามารถนำไปใช้งาน ศึกษา และต่อยอดได้อย่างอิสระ
