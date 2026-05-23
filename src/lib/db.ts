import 'server-only';
import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient.
 * Em dev, o Next.js recarrega módulos a cada save — sem o cache em globalThis
 * abriríamos uma conexão nova por reload e estouraria o pool do MySQL.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
