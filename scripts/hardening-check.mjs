import { readFileSync } from "node:fs";

const checks = [
  {
    file: "src/main.tsx",
    pattern: /\bconfirm\s*\(/,
    message: "Main app should not use browser confirm().",
  },
  {
    file: "src/main.tsx",
    pattern: /\balert\s*\(/,
    message: "Main app should not use browser alert().",
  },
  {
    file: "api/_lib/http.ts",
    pattern: /res\.status\(status\)\.json\(\{\s*error:\s*message\s*\}\)/,
    message: "API errors must include safe structured metadata.",
  },
  {
    file: "src/lib/cloud.ts",
    pattern: /SERVICE_ROLE|SUPABASE_SECRET|SUPABASE_SERVICE_ROLE/,
    message: "Frontend Supabase client must not reference service-role secrets.",
  },
];

const failures = [];

for (const check of checks) {
  const content = readFileSync(check.file, "utf8");
  if (check.pattern.test(content)) failures.push(`${check.file}: ${check.message}`);
}

if (failures.length) {
  console.error("Hardening check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Hardening check passed.");
