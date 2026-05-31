import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { sanitizeConnectionString } from "../src/lib/prisma";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const sanitized = sanitizeConnectionString(connectionString);
const adapter = new PrismaPg({ connectionString: sanitized });
const prisma = new PrismaClient({ adapter });

async function main() {
  const existing = await prisma.user.findFirst();
  if (!existing) {
    await prisma.user.create({
      data: { email: "hello@example.com", name: "Hello World" },
    });
    console.log("Seeded example user.");
  } else {
    console.log("Users already exist, skipping seed.");
  }
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
