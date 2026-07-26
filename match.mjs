// JobRadar AI — Matcher Agent (multi-model consensus)
// -------------------------------------------------------------
// หลาย AI model ให้คะแนน "อิสระต่อกัน" แล้วรวมเป็น consensus
//   + ตั้งธง ⚖️ เมื่อโมเดล "เห็นต่าง" (เอาไว้ดูซ้ำ = งานที่น่าสนใจ)
//
// มี ANTHROPIC_API_KEY → ผู้ตัดสิน 2 คน: Claude Opus + Claude Haiku
//                        (เพิ่ม Gemini/โมเดลอื่นได้ — แค่ push เข้า JUDGES, ดู README)
// ไม่มี key            → ผู้ตัดสิน 1 คน: keyword (รัน flow ได้โดยไม่ต้องจ่าย)
//
// รัน:  node match.mjs   (หรือ npm run match)
// -------------------------------------------------------------
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const JOBS_CSV = "remote-dev-jobs.csv";
const PROFILE = "profile.json";
const OUT = "ranked-jobs.csv";
const TOP_N = 10;
const AGREE_WITHIN = 15; // คะแนนต่างกัน ≤ นี้ = "เห็นตรงกัน"

// parser CSV (ไว้ค่อยแยกเป็น lib ตอนทำ orchestrator)
function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const SYSTEM =
  "You are a job-fit ranking assistant for a software engineer's job hunt. " +
  "For each job, give a fit score 0–100 based on: stack/skill match, seniority fit " +
  "(penalize senior/staff/lead roles for a junior candidate), domain interest, and remote/location fit. " +
  "Heavily penalize anything in the candidate's 'avoid' list. " +
  "Write each reason in THAI, max ~12 words, concrete.";

const SCHEMA = {
  type: "object",
  properties: {
    rankings: {
      type: "array",
      items: {
        type: "object",
        properties: { index: { type: "integer" }, score: { type: "integer" }, reason: { type: "string" } },
        required: ["index", "score", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["rankings"],
  additionalProperties: false,
};

// ---- ผู้ตัดสินที่ใช้ Claude (เปลี่ยน model ได้) ----
function claudeJudge(model) {
  const name = model.includes("opus") ? "opus" : model.includes("haiku") ? "haiku" : model;
  return {
    name,
    run: async (profile, jobs) => {
      const client = new Anthropic();
      const jobList = jobs
        .map((j, i) => `${i}. ${j.position} @ ${j.company} — ${j.location || "remote"} (${j.date})`)
        .join("\n");
      const res = await client.messages.create({
        model,
        max_tokens: 8000,
        system: SYSTEM,
        messages: [{ role: "user", content: `CANDIDATE PROFILE:\n${JSON.stringify(profile, null, 2)}\n\nJOBS (score every one, use exact index):\n${jobList}` }],
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
      });
      const text = res.content.find((b) => b.type === "text").text;
      const map = new Map();
      for (const r of JSON.parse(text).rankings) map.set(r.index, r);
      return map;
    },
  };
}

// ---- ผู้ตัดสิน fallback (keyword, ไม่ใช้ AI) ----
function keywordJudge() {
  return {
    name: "keyword",
    run: async (profile, jobs) => {
      const wanted = [...profile.skills, ...profile.interests].map((s) => s.toLowerCase());
      const avoid = (profile.avoid || []).map((s) => s.toLowerCase());
      const map = new Map();
      jobs.forEach((j, i) => {
        const hay = `${j.position} ${j.company}`.toLowerCase();
        const hits = wanted.filter((s) => hay.includes(s));
        const bad = avoid.filter((a) => hay.includes(a));
        let s = Math.min(80, hits.length * 22 + 18) - bad.length * 25;
        if (/\b(junior|intern|entry|graduate|grad)\b/.test(hay)) s += 15;
        if (/\b(senior|staff|lead|principal|vp|director|manager)\b/.test(hay)) s -= 18;
        s = Math.max(0, Math.min(100, s));
        map.set(i, { index: i, score: s, reason: hits.length ? `ตรงสกิล: ${hits.slice(0, 4).join(", ")}` : "ไม่ค่อยตรงสกิล" });
      });
      return map;
    },
  };
}

// ---- 1) โหลดข้อมูล ----
const rows = parseCsv(readFileSync(JOBS_CSV, "utf8"));
const header = rows[0];
const jobs = rows.slice(1)
  .filter((r) => r.length >= header.length && r.some(Boolean))
  .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
const profile = JSON.parse(readFileSync(PROFILE, "utf8"));

// ---- 2) ตั้งคณะผู้ตัดสิน (multi-model) ----
const hasKey = !!process.env.ANTHROPIC_API_KEY;
const JUDGES = hasKey
  ? [claudeJudge("claude-opus-4-8"), claudeJudge("claude-haiku-4-5")]
  : [keywordJudge()];
console.log(`โหลด ${jobs.length} งาน · ผู้ตัดสิน: ${JUDGES.map((j) => j.name).join(" + ")}`);

// ---- 3) ให้แต่ละ judge ลงคะแนนพร้อมกัน แล้วรวมเป็น consensus ----
// judge ตัวไหนล้ม (เครดิตหมด / rate limit / API ล่ม) ไม่ควรลาก pipeline ตายไปด้วย
const results = await Promise.all(
  JUDGES.map(async (jd) => {
    try {
      return { judge: jd, map: await jd.run(profile, jobs) };
    } catch (e) {
      const msg = String(e?.error?.error?.message || e?.message || e).split("\n")[0].slice(0, 140);
      console.warn(`   ⚠  ผู้ตัดสิน "${jd.name}" ล้มเหลว → ข้าม (${msg})`);
      return null;
    }
  })
);

let active = results.filter(Boolean);

// ล้มหมดทุกคน → ถอยไปใช้ keyword เพื่อให้ยังได้ผลลัพธ์ (ดีกว่าไม่ได้ digest เลย)
if (active.length === 0) {
  console.warn("   ↩  ผู้ตัดสิน AI ล้มทั้งหมด → ใช้ fallback keyword แทน");
  const kw = keywordJudge();
  active = [{ judge: kw, map: await kw.run(profile, jobs) }];
}

const ranked = jobs.map((j, i) => {
  const picks = active.map((a) => a.map.get(i));
  const scored = picks.filter(Boolean);
  const scores = scored.map((p) => p.score);
  const consensus = Math.round(scores.reduce((a, b) => a + b, 0) / (scores.length || 1));
  const spread = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0;
  const agreement = scores.length < 2 ? "—" : spread <= AGREE_WITHIN ? "agree" : "split";
  const models = active.map((a, k) => `${a.judge.name} ${picks[k]?.score ?? "?"}`).join(" / ");
  return { ...j, score: consensus, agreement, models, reason: scored[0]?.reason || "—" };
}).sort((a, b) => b.score - a.score);

// ---- 4) เซฟ + แสดงผล ----
const cols = ["score", "agreement", "models", "position", "company", "location", "date", "reason", "url"];
const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
writeFileSync(OUT, "﻿" + [cols.join(",")].concat(ranked.map((j) => cols.map((c) => esc(j[c])).join(","))).join("\r\n"), "utf8");

const splits = ranked.filter((j) => j.agreement === "split").length;
console.log(`\n🏆 TOP ${TOP_N} (consensus):\n`);
for (const j of ranked.slice(0, TOP_N)) {
  const flag = j.agreement === "split" ? "⚖️ เห็นต่าง" : j.agreement === "agree" ? "✓ ตรงกัน" : "";
  console.log(`${String(j.score).padStart(3)}  ${j.position} @ ${j.company}`);
  console.log(`     [${j.models}] ${flag}  ↳ ${j.reason}`);
}
console.log(`\n✅ เซฟ ${ranked.length} งาน → ${OUT}`);
if (active.length > 1) console.log(`   ⚖️ โมเดลเห็นต่างกัน ${splits} งาน (ควรดูซ้ำ)`);
