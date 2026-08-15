import { readFileSync, unlinkSync } from "node:fs";
import { prisma } from "../packages/database/dist/index.js";

const statePath = ".playwright-full-route-fixture.json";
const state = JSON.parse(readFileSync(statePath, "utf8"));

if (state.organizationId) {
  await prisma.organization.delete({ where: { id: state.organizationId } });
}
await prisma.user.delete({ where: { id: state.userId } }).catch(() => undefined);
unlinkSync(statePath);
await prisma.$disconnect();

process.stdout.write(JSON.stringify({ cleaned: true, organizationId: state.organizationId }));
