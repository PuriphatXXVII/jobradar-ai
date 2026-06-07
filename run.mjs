// JobRadar AI — Orchestrator
// -------------------------------------------------------------
// ร้อย agents ทั้งหมดเป็น pipeline เดียว:  Scout → Matcher → Reporter
// รัน:  node run.mjs   (หรือ npm start)
// ใช้โดย GitHub Actions ให้รันเองทุกเช้า → "ทีม AI ที่ทำงานหางานแทนเรา"
// -------------------------------------------------------------
import { execSync } from "node:child_process";

// soft:true = ถ้า step นี้ล้ม ไม่ต้องหยุด pipeline (ใช้ข้อมูลเดิมต่อได้)
const steps = [
  { name: "🛰️  Scout    — ดึงงาน (scrape)", cmd: "node scrape.mjs", soft: true },
  { name: "🤖 Matcher  — AI ให้คะแนน", cmd: "node match.mjs" },
  { name: "📊 Reporter — สร้าง digest", cmd: "node report.mjs" },
];

console.log("═".repeat(48));
console.log("  JobRadar AI — pipeline เริ่มทำงาน");
console.log("═".repeat(48));

const t0 = Date.now();
for (const s of steps) {
  const st = Date.now();
  console.log(`\n━━ ${s.name} ━━`);
  try {
    execSync(s.cmd, { stdio: "inherit" });
    console.log(`   ⏱  ${((Date.now() - st) / 1000).toFixed(1)}s`);
  } catch (e) {
    if (s.soft) {
      console.log(`   ⚠  ข้าม step นี้ (ใช้ข้อมูลเดิมต่อ): ${e.message.split("\n")[0]}`);
      continue;
    }
    console.error(`   ✗  ${s.name} ล้มเหลว — หยุด pipeline`);
    process.exit(1);
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log("\n" + "═".repeat(48));
console.log(`  ✅ เสร็จทั้ง pipeline ใน ${secs}s`);
console.log("     → แทนงานหาเอง ~30–60 นาที/วัน (รันเองทุกเช้า)");
console.log("     → ผลลัพธ์: ranked-jobs.csv · digest.md · digest.html");
console.log("═".repeat(48));
