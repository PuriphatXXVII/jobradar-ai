import { chromium } from "playwright";

const b = await chromium.launch();
const p = await b.newPage();
const resp = await p.goto("https://remoteok.com/remote-dev-jobs", {
  waitUntil: "domcontentloaded",
});
console.log("HTTP status :", resp?.status());
console.log("Page title  :", await p.title());
await p.waitForTimeout(3000);
const info = await p.evaluate(() => ({
  jobRows: document.querySelectorAll("tr.job").length,
  bodyChars: document.body?.innerText?.length || 0,
  firstWords: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 220),
}));
console.log("tr.job rows :", info.jobRows);
console.log("body length :", info.bodyChars);
console.log("body start  :", info.firstWords);
await b.close();
