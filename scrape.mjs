// remote-dev-jobs scraper — Playwright + CSV
// -------------------------------------------------------------
// รันครั้งแรก:  npm install && npx playwright install chromium
// รันสคริปต์:   node scrape.mjs
// ผลลัพธ์:      remote-dev-jobs.csv (เปิดด้วย Excel / Google Sheets)
// -------------------------------------------------------------
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

// ---- ตั้งค่า (เปลี่ยนได้ตามงานลูกค้า) ----
const URL = "https://remoteok.com/remote-dev-jobs";
const OUT = "remote-dev-jobs.csv";
const SINCE = "2025-01-01"; // เอาเฉพาะงานตั้งแต่วันนี้เป็นต้นไป

// กรองด้วย "ชื่อตำแหน่ง" เท่านั้น
// (บทเรียน: tags บน remoteok เป็น SEO spam ยัดมั่ว เชื่อไม่ได้ ห้ามใช้กรอง)
const TITLE_RE =
  /(developer|engineer|software|programmer|front[- ]?end|back[- ]?end|full[- ]?stack|devops|data (scientist|analyst|engineer)|machine learning|\bml\b|\bai\b|python|javascript|typescript|\breact\b|node|golang|\brust\b|sdet|\bqa\b|web developer|architect|tech(nical)? lead)/i;

const run = async () => {
  const browser = await chromium.launch(); // เพิ่ม { headless: false } ถ้าอยากเห็นเบราว์เซอร์
  const page = await browser.newPage();

  // 1) เปิด (Navigate)
  console.log("เปิดเว็บ:", URL);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  // ⚠️ remoteok ฉีดแถวงานด้วย JS "หลัง" หน้าโหลด — ถ้าดึงเร็วเกินไปจะได้ 0 แถว!
  // รอจนมีแถวงานจริงโผล่ครบก่อน (กับดักคลาสสิกของ dynamic page)
  await page.waitForFunction(
    () => document.querySelectorAll("tr.job").length > 5,
    { timeout: 20000 },
  );
  await page.waitForTimeout(1500); // เผื่อเวลาให้ render เสร็จสมบูรณ์

  // 📜 remoteok ใช้ infinite scroll — เลื่อนหน้าลงเพื่อโหลดงานเพิ่ม
  // (งาน dev จริงอยู่ล่างๆ ใต้งาน sponsored) เลื่อนจนงานไม่เพิ่มแล้วค่อยหยุด
  let prev = 0;
  for (let i = 0; i < 12; i++) {
    const count = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      return document.querySelectorAll("tr.job").length;
    });
    if (count === prev) break; // ไม่มีงานเพิ่มแล้ว → หยุด
    prev = count;
    await page.waitForTimeout(1200); // รอให้ชุดถัดไปโหลด
  }
  console.log("โหลดงานทั้งหมด:", prev, "แถว (หลังเลื่อนหน้า)");

  // 2) ดึง (Extract) — ทำความสะอาดเบื้องต้นใน browser context
  const rawJobs = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("tr.job"));
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      const txt = (sel) => r.querySelector(sel)?.textContent?.trim() || "";
      const position = txt('[itemprop="title"]') || txt("h2");
      const company = txt('[itemprop="name"]') || txt("h3");
      if (!position) continue;
      const key = (position + "|" + company).toLowerCase();
      if (seen.has(key)) continue; // กันงานซ้ำ
      seen.add(key);
      const locs = Array.from(r.querySelectorAll(".location")).map((t) =>
        t.textContent.trim(),
      );
      const salary =
        locs.find((l) => l.includes("$") || l.toLowerCase().includes("premium")) ||
        "";
      let location = locs.filter((l) => l !== salary).join(" | ");
      location = location
        .replace(/[^\x00-\x7F]/g, "") // ตัดอักษรนอก ASCII (emoji ธง / ชื่อเมืองภาษาอื่น)
        .split(/[|,]/) // แยกตามตัวคั่น แล้วทิ้งช่องว่างเปล่า กัน ", ," ค้าง
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" | ");
      const slug = r.getAttribute("data-slug") || "";
      const url = slug ? "https://remoteok.com/remote-jobs/" + slug : "";
      const date = (
        r.querySelector("time")?.getAttribute("datetime") || ""
      ).slice(0, 10);
      out.push({ position, company, location, date, url });
    }
    return out;
  });

  // 3) แปลง (Transform) — กรองเฉพาะงาน dev/AI ล่าสุด + เรียงใหม่→เก่า
  const jobs = rawJobs
    .filter((j) => TITLE_RE.test(j.position) && !/data entry/i.test(j.position))
    .filter((j) => j.date >= SINCE)
    .sort((a, b) => b.date.localeCompare(a.date));

  // 4) บันทึก (Store) — เขียน CSV (มี BOM ให้ Excel อ่าน UTF-8 ถูก)
  const cols = ["position", "company", "location", "date", "url"];
  const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const csv =
    "﻿" +
    [cols.join(",")]
      .concat(jobs.map((j) => cols.map((c) => esc(j[c])).join(",")))
      .join("\r\n");

  writeFileSync(OUT, csv, "utf8");
  console.log(
    `เจอทั้งหมด ${rawJobs.length} งาน → กรองเหลือ dev ${jobs.length} งาน → เซฟ ${OUT}`,
  );

  await browser.close();
};

run().catch((e) => {
  console.error("สคริปต์พัง:", e);
  process.exit(1);
});
