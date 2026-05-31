import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export const sanitizeConnectionString = (urlStr: string): string => {
  if (!urlStr.startsWith("postgresql://") && !urlStr.startsWith("postgres://")) {
    return urlStr;
  }
  try {
    const lastAtIndex = urlStr.lastIndexOf("@");
    if (lastAtIndex === -1) return urlStr;

    const credentialsPart = urlStr.substring(0, lastAtIndex);
    const hostPart = urlStr.substring(lastAtIndex + 1);

    const protocolIndex = credentialsPart.indexOf("://");
    if (protocolIndex === -1) return urlStr;

    const protocolAndUserPass = credentialsPart.substring(protocolIndex + 3);
    const colonIndex = protocolAndUserPass.indexOf(":");
    if (colonIndex === -1) return urlStr;

    const user = protocolAndUserPass.substring(0, colonIndex);
    const password = protocolAndUserPass.substring(colonIndex + 1);
    const protocol = credentialsPart.substring(0, protocolIndex + 3);

    const decodedPassword = decodeURIComponent(password);
    const encodedPassword = encodeURIComponent(decodedPassword);

    return `${protocol}${user}:${encodedPassword}@${hostPart}`;
  } catch {
    return urlStr;
  }
};

const createPrismaClient = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const sanitized = sanitizeConnectionString(connectionString);
  const adapter = new PrismaPg({ connectionString: sanitized });
  return new PrismaClient({ adapter });
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = (() => {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
})();
