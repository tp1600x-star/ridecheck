# 🚖 RideCheck Thailand — Open Source Smart Ride Price Comparison Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests: Passing](https://img.shields.io/badge/tests-26%2F26%20passed-brightgreen.svg)](test-runner.js)
[![Platform: Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![Database: Firebase Firestore](https://img.shields.io/badge/Database-Firebase%20Firestore-orange.svg)](https://firebase.google.com/)

**RideCheck Thailand** เป็นแพลตฟอร์มเปรียบเทียบราคาเรียกรถโดยสารออนไลน์แบบเรียลไทม์ (Ride-Hailing Comparison Engine) ตัวแรกที่สร้างขึ้นเพื่อผู้บริโภคชาวไทย รวบรวมและเปรียบเทียบค่าโดยสารระหว่าง **Grab, Bolt, LINE MAN, inDrive, Maxim** พร้อมระบบจำลองอาคารออฟฟิศ 3D AI Autonomous Workforce และระบบผู้ช่วยส่วนตัวผ่าน Telegram Bot

---

## 🌟 ฟีเจอร์เด่น (Key Features)

1. **⚡ Real-Time Price Comparison Engine (`index.html`)**
   - คำนวณเส้นทางและระยะทางด้วย Leaflet, OSRM และรองรับ Google Maps Platform
   - เปรียบเทียบราคารถทุกประเภท (Eco / Compact, Sedan, Premium, Bike, SUV, XL)
   - Dynamic Surge Pricing & Weather Impact คำนวณผลกระทบของฝนตกและช่วงเวลาเร่งด่วนตามพิกัดจริง
   - Zero Data Loss: เก็บสถิติยอดประหยัดสะสมลง Firestore หรือ fallback เป็น localStorage ออฟไลน์

2. **🏢 3D AI Autonomous Office Simulator (`office.html`)**
   - จำลองอาคารสำนักงานและพนักงาน 14 แผนกแบบ 3D WebGL (Three.js) ประหยัดทรัพยากร
   - ซิงก์สถานะการทำงานจริงของบอท AI แต่ละตัวผ่าน Firestore แบบ Real-Time
   - มีระบบ Executive Inbox, ห้องประชุมเสมือน, Proof of Work Lab และบันทึกผลงาน

3. **🤖 Autonomous AI Workforce Engine (`worker-engine.js`)**
   - ทีมพนักงาน AI ประจำ 14 แผนก (Dev, QA, PM, Data Analyst, Legal, Finance, Marketing ฯลฯ)
   - ดึงข้อมูลสภาพอากาศจาก Open-Meteo API เพื่อวิเคราะห์ Surge Pricing ทุกชั่วโมง
   - บันทึกงานที่ทำสำเร็จลง Firestore หรือ `project-resources.json` โดยอัตโนมัติ

4. **🎩 Baron Secretary AI (`telegram-baron.js`)**
   - บอทเลขาฯ ส่วนตัวผ่าน Telegram รองรับระบบ Multi-Admin
   - คำสั่งควบคุมระบบระยะไกล เช่น `/status`, `/deploy`, `/fix`, `/report`, `/workforce`
   - เชื่อมต่อกับ Google Gemini API เพื่อตอบคำถามและวิเคราะห์ข้อมูลเชิงกลยุทธ์

5. **🛡️ Zero-Bug Pre-Deploy Automated Test Runner (`test-runner.js`)**
   - ระบบทดสอบอัตโนมัติ 26 การทดสอบ ครอบคลุม Core HTML, AI Engines, API Integrations, Security & Configuration
   - ป้องกันการ deploy โค้ดที่มีข้อผิดพลาดขึ้น Production

---

## 🏗️ สถาปัตยกรรมระบบ (Architecture)

```text
[ ผู้ใช้งาน / Clients ]
       │
       ├──► Web Frontend (index.html / v2.html) ──► Leaflet / Google Maps + OSRM
       │           │
       │           ▼
       ├──► 3D AI Virtual Office (office.html) ──► Three.js WebGL (60 FPS)
       │           │
       ▼           ▼
[ Firebase Firestore Database ]  ◄── (Hardened firestore.rules)
       ▲           ▲
       │           │
[ Node.js Backend & AI Workforce ]
       ├──► worker-engine.js (Autonomous AI 14 แผนก)
       ├──► telegram-baron.js (Telegram Bot + Gemini AI)
       └──► test-runner.js (Automated Pre-Deploy Quality Gate)
```

---

## 🚀 เริ่มต้นใช้งาน (Getting Started)

### 1. ความต้องการของระบบ (Prerequisites)
- [Node.js](https://nodejs.org/) v18.0.0 หรือใหม่กว่า
- บัญชี [Firebase Console](https://console.firebase.google.com/) (สำหรับ Firestore & Hosting)
- บัญชี [Telegram](https://telegram.org/) และสร้างบอทผ่าน [@BotFather](https://t.me/botfather) (กรณีต้องการใช้ Baron AI)
- [Google Gemini API Key](https://aistudio.google.com/) (กรณีต้องการเปิดใช้ AI Agent Intelligence)

### 2. โคลนและติดตั้ง Dependencies
```bash
git clone https://github.com/tp1600x-star/ridecheck.git
cd ridecheck
npm install
```

### 3. ตั้งค่า Environment Variables
คัดลอกไฟล์ `.env.example` เป็น `.env` แล้วระบุค่าของคุณ:
```bash
cp .env.example .env
```
เนื้อหาใน `.env`:
```ini
# Google Gemini API Key สำหรับประมวลผลคำสั่ง AI
GEMINI_API_KEY=your_gemini_api_key_here

# Telegram Bot Token จาก @BotFather
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# Telegram Numeric User IDs สำหรับผู้ดูแลระบบ (Admin)
CEO_USER_ID=123456789
PARTNER_USER_ID=987654321
```

### 4. รันระบบทดสอบ (Pre-Deploy Tests)
```bash
npm test
```
ผลลัพธ์ควรผ่าน 100% (26/26 tests passed) ก่อนขึ้น Production

### 5. เปิดใช้งานบริการต่างๆ
```bash
# รันเว็บเซิร์ฟเวอร์แบบ Local
npm start

# รัน Autonomous AI Workforce Cycle
npm run worker:once

# รัน Baron Secretary Telegram Bot
npm run baron
```

---

## 🔒 ความปลอดภัยและความเป็นส่วนตัว (Security Best Practices)

- **Telegram Bot Tokens:** ห้าม commit token ลงใน repository โดยเด็ดขาด ให้ใช้ `process.env.TELEGRAM_BOT_TOKEN` หรือ `process.env.TELEGRAM_TOKEN` เท่านั้น หากเผลอทำ token หลุด ให้ใช้คำสั่ง `/revoke` ใน [@BotFather](https://t.me/botfather) ทันที
- **Firebase Web API Key:** Key ฝั่ง Client Web (`firebase-init.js`) ถูกจำกัดสิทธิ์ความปลอดภัยผ่าน **Cloud Firestore Security Rules (`firestore.rules`)** เพื่อป้องกันการแทรกแซงหรือเขียนทับข้อมูลโดยไม่ได้รับอนุญาต
- **Logs & Private Data:** ไดเรกทอรี `logs/` ถูกเพิ่มใน `.gitignore` เรียบร้อยแล้ว เพื่อไม่ให้ข้อความแชทและประวัติการทำงานถูกเผยแพร่สู่สาธารณะ

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```text
ridecheck/
├── index.html                 # หน้าเว็บหลักสำหรับเปรียบเทียบราคารถ (Web App)
├── office.html                # อาคารจำลองสำนักงานเสมือน 3D AI Headquarters
├── code-map.html              # Interactive Architecture Visualization Map
├── ridecheck-db.js            # Universal Data Layer (Firestore + localStorage)
├── firebase-init.js           # Client-side Firebase Configuration
├── firebase-bridge.js         # Node.js Server-side Firebase Bridge
├── firestore.rules            # Hardened Firestore Security Rules
├── firebase.json              # Firebase Hosting & Firestore deployment spec
├── worker-engine.js           # Autonomous 14-Department AI Workforce Engine
├── telegram-baron.js          # Telegram Multi-Admin Commander Bot
├── test-runner.js             # Automated Zero-Bug Pre-Deploy Testing Suite
├── .github/workflows/         # GitHub Actions CI/CD (bot-runner.yml)
├── .env.example               # Example Environment Configuration
├── LICENSE                    # MIT License
└── package.json               # Project manifest and scripts
```

---

## 📄 ใบอนุญาต (License)

โปรเจกต์นี้เผยแพร่ภายใต้สัญญาอนุญาต [MIT License](LICENSE) สามารถนำไปต่อยอด ดัดแปลง และพัฒนาต่อได้อย่างอิสระ
