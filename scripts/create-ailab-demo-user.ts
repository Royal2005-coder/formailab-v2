import bcrypt from "bcryptjs";

import { prisma } from "../packages/database/src/index";

const email = process.env.AILAB_DEMO_EMAIL;
const password = process.env.AILAB_DEMO_PASSWORD;
const workspaceId = process.env.AILAB_DEMO_WORKSPACE_ID;
const organizationId = process.env.AILAB_DEMO_ORGANIZATION_ID;

if (!email || !password || !workspaceId || !organizationId) {
  throw new Error(
    "AILAB_DEMO_EMAIL, AILAB_DEMO_PASSWORD, AILAB_DEMO_WORKSPACE_ID and AILAB_DEMO_ORGANIZATION_ID are required"
  );
}

const main = async (): Promise<void> => {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, organizationId },
    select: { id: true },
  });

  if (!workspace) {
    throw new Error("Workspace does not belong to the requested organization");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      name: "AILAB Demo User",
      email,
      emailVerified: true,
      locale: "vi-VN",
      password: passwordHash,
      identityProvider: "email",
    },
    update: {
      name: "AILAB Demo User",
      emailVerified: true,
      locale: "vi-VN",
      password: passwordHash,
      isActive: true,
    },
    select: { id: true, email: true },
  });

  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: "credential",
        providerAccountId: user.id,
      },
    },
    create: {
      userId: user.id,
      type: "credential",
      provider: "credential",
      providerAccountId: user.id,
      password: passwordHash,
    },
    update: { password: passwordHash, userId: user.id, type: "credential" },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId } },
    create: { userId: user.id, organizationId, accepted: true, role: "member" },
    update: { accepted: true, role: "member" },
  });

  const team = await prisma.team.upsert({
    where: { organizationId_name: { organizationId, name: "AILAB Demo Testers" } },
    create: { organizationId, name: "AILAB Demo Testers" },
    update: {},
    select: { id: true },
  });

  await prisma.teamUser.upsert({
    where: { teamId_userId: { teamId: team.id, userId: user.id } },
    create: { teamId: team.id, userId: user.id, role: "contributor" },
    update: { role: "contributor" },
  });

  await prisma.workspaceTeam.upsert({
    where: { workspaceId_teamId: { workspaceId, teamId: team.id } },
    create: { workspaceId, teamId: team.id, permission: "readWrite" },
    update: { permission: "readWrite" },
  });

  process.stdout.write(
    JSON.stringify({
      created: true,
      userId: user.id,
      email: user.email,
      organizationRole: "member",
      team: "AILAB Demo Testers",
      workspacePermission: "readWrite",
    })
  );
};

main()
  .catch((error: unknown) => {
    process.stderr.write(error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
