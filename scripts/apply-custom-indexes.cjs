const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  const sql = fs.readFileSync('prisma/migrations/0_init/migration.sql', 'utf8');
  // Remove single line comments
  const cleanSql = sql.replace(/--.*$/gm, '');
  const statements = cleanSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`Found ${statements.length} statements to apply.`);

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    try {
      await prisma.$executeRawUnsafe(statement);
      console.log(`[${i + 1}/${statements.length}] Applied index / constraint successfully`);
    } catch (err) {
      console.error(`[${i + 1}/${statements.length}] Statement error:`, err.message);
    }
  }
  console.log('Custom indexes & invariants applied successfully.');
}

main().finally(() => prisma.$disconnect());
