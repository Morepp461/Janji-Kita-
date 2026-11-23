import { readFileSync } from "node:fs";

const files = [
  "src/App.tsx",
  "src/features/admin/AdminDashboard.tsx",
  "src/features/admin/CommerceAdmin.tsx",
  "src/features/admin/FinanceDashboard.tsx",
  "src/features/commerce/CheckoutPage.tsx",
  "src/features/commerce/OrdersPage.tsx",
  "src/features/editor/InvitationEditor.tsx",
];

for (const path of files) {
  const content = readFileSync(path);
  process.stdout.write(`FORMAT_FILE:${path}:${content.toString("base64")}\n`);
}
