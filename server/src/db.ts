import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

const prismaPkgPath = require.resolve('@prisma/client/package.json');
const prismaDefaultPath = require.resolve('@prisma/client/default.js');
const prismaGeneratedDefaultPath = path.resolve(path.dirname(prismaPkgPath), '.prisma/client/default.js');

console.log('[db] prisma diagnostics', {
  cwd: process.cwd(),
  nodeEnv: process.env.NODE_ENV,
  prismaPkgPath,
  prismaDefaultPath,
  prismaGeneratedDefaultPath,
  generatedDefaultExists: fs.existsSync(prismaGeneratedDefaultPath),
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
