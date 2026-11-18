import { migrateCheck, renderReport } from "./lib/migrate.js";
const res = await migrateCheck({
  source: "https://38.190.206.18", sourceHost: "cadpop.com",
  target: "https://cadpop.com",
  paths: ["/", "/upgrade/", "/support/", "/dsh/", "/viewer/", "/pricing/"],
  insecure: true, maxPaths: 10,
});
console.log(renderReport(res, { source: "旧站", target: "新站" }));
