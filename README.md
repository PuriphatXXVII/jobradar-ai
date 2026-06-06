# 🕷️ Remote Dev Jobs Scraper

AI-assisted web scraper ที่ดึงประกาศงาน **remote developer / AI** จาก [remoteok.com](https://remoteok.com)
มาทำความสะอาด กรอง แล้วเซฟเป็น **CSV** พร้อมเปิดใน Excel / Google Sheets

> โปรเจกต์ตัวอย่างสาย **AI Automation** — งานสไตล์นี้ลูกค้าจ้างจริงบน Upwork/Fiverr
> ("ดึงข้อมูล X จากเว็บ Y มาลงตาราง อัปเดตให้อัตโนมัติ")

---

## ⚙️ วิธีรัน

```bash
npm install                      # ติดตั้ง playwright
npx playwright install chromium  # โหลดเบราว์เซอร์ (ครั้งแรกครั้งเดียว)
node scrape.mjs                  # รัน → ได้ remote-dev-jobs.csv
```

ผลลัพธ์ตัวอย่าง:
```
เปิดเว็บ: https://remoteok.com/remote-dev-jobs
เจอทั้งหมด 39 งาน → กรองเหลือ dev 16 งาน → เซฟ remote-dev-jobs.csv
```

---

## 🧠 หลักการ: scraper ทุกตัวมี 4 สเต็ป

| สเต็ป | ทำอะไร | ใช้เครื่องมือ |
|------|--------|--------------|
| 1. **Navigate** | เปิดหน้าเว็บ | Playwright (`page.goto`) |
| 2. **Extract** | คว้าข้อมูลจาก HTML | Playwright (`page.evaluate`) |
| 3. **Transform** | กรอง / ทำความสะอาด / จัดเรียง | JavaScript |
| 4. **Store** | เซฟ CSV / Sheet / DB | Node `fs` |

---

## ⚖️ จรรยาบรรณ (ทำตามทุกครั้ง)

- ✅ ดึงเฉพาะ **ข้อมูลสาธารณะ** (ไม่ต้อง login)
- ✅ เคารพ `robots.txt` + ToS ของเว็บ
- ✅ ดึงช้าๆ อย่ายิงรัวจนเซิร์ฟเวอร์เขาล่ม
- ❌ ห้ามดึงข้อมูลส่วนตัว / หลัง login / เว็บที่ห้ามชัดเจน (LinkedIn, Facebook ฟ้องจริง)

---

## 💡 บทเรียนจากข้อมูลจริง (สำคัญที่สุด)

ข้อมูลดิบจากเว็บ **ไม่เคยสะอาด** — ที่เจอจาก remoteok:

1. **Tag เป็น SEO spam** — ทุกงานถูกยัด tag มั่วเป็นร้อย (งาน "File Clerk" มี tag "Golang")
   → **ห้ามกรองด้วย tags** ให้กรองด้วย **ชื่อตำแหน่ง** แทน
2. **เงินเดือนถูกซ่อนหลัง paywall** (`Upgrade to Premium to see salary`)
   → ดึงได้เฉพาะที่เปิดสาธารณะ — เป็นเรื่องปกติ
3. **มีงานเก่าปี 2016 ปนมา** (remoteok โหลด archive ท้ายหน้า)
   → กรองด้วยวันที่ (`SINCE`)
4. **งานซ้ำ** (ผู้ลงประกาศโพสต์ซ้ำหลายครั้ง)
   → dedupe ด้วย `ชื่อตำแหน่ง + บริษัท`

> **แก่นของงาน automation จริง = เข้าใจธรรมชาติของข้อมูลแต่ละแหล่ง แล้วเขียน Transform ให้ตรง**

---

## 🔧 ปรับแต่ง / ต่อยอด

แก้ค่าด้านบนของ `scrape.mjs`:
- `URL` → เปลี่ยนหมวดงาน เช่น `/remote-python-jobs`, `/remote-react-jobs`
- `TITLE_RE` → เปลี่ยนคำที่อยากกรอง (เช่นเอาเฉพาะ Python/React)
- `SINCE` → เปลี่ยนช่วงวันที่

## 🚀 ไอเดียยกระดับ (เฟสต่อไป)

- [ ] เขียนผลลง **Google Sheet** อัตโนมัติ (แทน CSV)
- [ ] ตั้ง **schedule** ให้รันเองทุกเช้า (cron / Task Scheduler)
- [ ] ส่ง **สรุปทาง email** เมื่อเจองานใหม่ที่ตรงสเปก
- [ ] ดึงหลายแหล่งพร้อมกัน (multi-source) แล้วรวมเป็นตารางเดียว
- [ ] ให้ AI ช่วย **จัดอันดับความเหมาะสม** กับโปรไฟล์เรา

---

*Stack: Node.js + Playwright. สร้างเป็นตัวอย่างพอร์ตสาย AI Automation.*
