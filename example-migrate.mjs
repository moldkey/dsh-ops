import { migrateCheck, renderReport } from "./lib/migrate.js";
const res = await migrateCheck({
  source: "https://203.0.113.10", sourceHost: "old.example.com",
  target: "https://new.example.com",
  paths: ["/", "/about/", "/pricing/", "/docs/"],
  insecure: true, maxPaths: 10,
});
console.log(renderReport(res, { source: "旧站", target: "新站" }));