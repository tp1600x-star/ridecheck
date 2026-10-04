# 📥 โฟลเดอร์รับตัวอย่างราคาจริง (Contributions Inbox)

วางไฟล์ CSV ที่ export จากปุ่ม **"ส่งข้อมูลราคาจริง"** ในหน้าเว็บ RideCheck
(ปุ่มอยู่ในโมดอล `Contribute Fare` — ได้ไฟล์ชื่อ `ridecheck_contributions_*.csv`)
ลงในโฟลเดอร์นี้ จากนั้นระบบ Auto-Learning Loop จะดูดข้อมูลเข้า
`data/calibration.csv` ให้เองอัตโนมัติในรอบถัดไป

## วงจรเรียนรู้อัตโนมัติ

1. ผู้ใช้/ทีมส่งราคาจริงผ่านหน้าเว็บ → Firestore `fare_contributions` หรือไฟล์ในโฟลเดอร์นี้
2. `scripts/ingest-firestore-samples.js` ดึง+กรอง+กันซ้ำ เข้า `data/calibration.csv`
3. `scripts/auto-calibrate.js` ฝึกโมเดลใหม่และเทียบ MAPE
4. **ปล่อยเฉพาะเมื่อดีขึ้น** — ถ้าแย่ลงจะ ROLLBACK พารามิเตอร์เดิมอัตโนมัติ
5. GitHub Actions (`auto-calibrate.yml`) รันทุกวันอาทิตย์ 01:00 (เวลาไทย) + สั่งมือได้

เกณฑ์คุณภาพ: Overall MAPE ต้องต่ำกว่า 15% เสมอ (Zero-Tolerance QA Gate)
