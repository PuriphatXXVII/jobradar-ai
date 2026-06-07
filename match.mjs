// JobRadar AI — Matcher Agent
// -------------------------------------------------------------
// อ่านงานจาก remote-dev-jobs.csv + โปรไฟล์จาก profile.json
// แล้วให้ Claude ให้คะแนน "ความเหมาะสม 0–100" + เหตุผล แล้วจัดอันดับ
//
// รัน:  npm install   (ครั้งแรก)
//       node match.mjs
// ผลลัพธ์: ranked-jobs.csv + ตาราง top 10 บนหน้าจอ
//
// ไม่มี ANTHROPIC_API_KEY ก็รันได้ — จะใช้ fallback ให้คะแนนแบบ keyword
// (เหมือน SmartDesk: มี dev fallback เพื่อทดสอบ flow ได้โดยไม่ต้องจ่ายเงิน)
// -------------------------------------------------------------
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

// ---- ตั้งค่า ----
const JOBS_CSV = "remote-dev-jobs.csv";
const PROFILE = "profile.json";
const OUT = "ranked-jobs.csv";
const TOP_N = 10;

// เลือกโมเดล: ค่าเริ่มต้น opus (ฉลาดสุด). งานนี้คือ "ให้คะแนนจำนวนมาก" ซึ่งเป็น
// classification เบา ๆ — ถ้าอยากประหยัด ~5 เท่า เปลี่ยนเป็น "claude-haiku-4-5" ได้
// ($1/$5 ต่อ 1M tokens เทียบกับ opus $5/$25). คุณภาพ haiku พอสำหรับ scoring แบบนี้
const MODEL = "claude-opus-4-8";

// ---- 1) อ่านข้อมูล (Load) ----
// parser CSV เล็ก ๆ ที่รองรับ field มี comma/quote ซ้อน (ไฟล์เราห่อทุก field ด้วย ")
function parseCsv(text) {
  text = text.replace(/^﻿/, ""); // ตัด BOM ที่ scraper ใส่ไว้ให้ Excel
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // "" = quote จริง
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCsv(readFileSync(JOBS_CSV, "utf8"));
const header = rows[0];
const jobs = rows.slice(1)
  .filter((r) => r.length >= header.length && r.some(Boolean))
  .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
const profile = JSON.parse(readFileSync(PROFILE, "utf8"));

console.log(`โหลด ${jobs.length} งาน + โปรไฟล์ "${profile.name}"`);

// ---- 2) ให้คะแนน (Score) ----
// แก่นของ "AI agent" = เรียก LLM โดยบังคับ output เป็น JSON schema → เอาไปใช้ต่อได้แน่นอน
async function scoreWithClaude(profile, jobs) {
  const client = new Anthropic(); // อ่าน ANTHROPIC_API_KEY จาก env อัตโนมัติ
  const jobList = jobs
    .map((j, i) => `${i}. ${j.position} @ ${j.company} — ${j.location || "remote"} (${j.date})`)
    .join("\n");

  const system =
    "You are a job-fit ranking assistant for a software engineer's job hunt. " +
    "For each job, give a fit score 0–100 based on: stack/skill match, seniority fit " +
    "(penalize senior/staff/lead roles for a junior candidate), domain interest, and remote/location fit. " +
    "Heavily penalize anything in the candidate's 'avoid' list. " +
    "Write each reason in THAI, max ~12 words, concrete (mention the matching skill or the mismatch).";

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system,
    messages: [{
      role: "user",
      content:
        `CANDIDATE PROFILE:\n${JSON.stringify(profile, null, 2)}\n\n` +
        `JOBS (score every one, use the exact index):\n${jobList}`,
    }],
    // โครงสร้าง output แบบบังคับ (structured outputs) — รับประกันว่าได้ JSON ตาม schema
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            rankings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  index: { type: "integer" },
                  score: { type: "integer" },
                  reason: { type: "string" },
                },
                required: ["index", "score", "reason"],
                additionalProperties: false,
              },
            },
          },
          required: ["rankings"],
          additionalProperties: false,
        },
      },
    },
  });

  const text = res.content.find((b) => b.type === "text").text;
  return JSON.parse(text).rankings;
}

// fallback: ให้คะแนนแบบนับ keyword (ไม่มี key ก็รัน flow ได้)
function scoreFallback(profile, jobs) {
  const wanted = [...profile.skills, ...profile.interests].map((s) => s.toLowerCase());
  const avoid = (profile.avoid || []).map((s) => s.toLowerCase());
  return jobs.map((j, i) => {
    const hay = `${j.position} ${j.company}`.toLowerCase();
    const hits = wanted.filter((s) => hay.includes(s));
    const bad = avoid.filter((a) => hay.includes(a));
    let score = Math.min(80, hits.length * 22 + 18) - bad.length * 25;
    if (/\b(junior|intern|entry|graduate|grad)\b/.test(hay)) score += 15;
    if (/\b(senior|staff|lead|principal|vp|director|manager)\b/.test(hay)) score -= 18;
    score = Math.max(0, Math.min(100, score));
    const reason = hits.length ? `ตรงสกิล: ${hits.slice(0, 4).join(", ")}` : "ไม่ค่อยตรงสกิล";
    return { index: i, score, reason };
  });
}

const hasKey = !!process.env.ANTHROPIC_API_KEY;
console.log(hasKey ? `🤖 ให้คะแนนด้วย ${MODEL}...` : "⚙️  ไม่เจอ ANTHROPIC_API_KEY → ใช้ fallback (keyword)");
const rankings = hasKey ? await scoreWithClaude(profile, jobs) : scoreFallback(profile, jobs);

// ---- 3) รวม + จัดอันดับ (Transform) ----
const byIndex = new Map(rankings.map((r) => [r.index, r]));
const ranked = jobs
  .map((j, i) => ({ ...j, ...(byIndex.get(i) || { score: 0, reason: "—" }) }))
  .sort((a, b) => b.score - a.score);

// ---- 4) บันทึก + แสดงผล (Store) ----
const cols = ["score", "position", "company", "location", "date", "reason", "url"];
const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
const csv = "﻿" + [cols.join(",")]
  .concat(ranked.map((j) => cols.map((c) => esc(j[c])).join(",")))
  .join("\r\n");
writeFileSync(OUT, csv, "utf8");

console.log(`\n🏆 TOP ${TOP_N} งานที่ตรงกับคุณที่สุด:\n`);
for (const j of ranked.slice(0, TOP_N)) {
  const bar = "█".repeat(Math.round(j.score / 10)).padEnd(10, "·");
  console.log(`${String(j.score).padStart(3)} ${bar}  ${j.position}  @ ${j.company}`);
  console.log(`              ↳ ${j.reason}`);
}
console.log(`\n✅ เซฟครบ ${ranked.length} งาน (เรียงตามคะแนน) → ${OUT}`);
