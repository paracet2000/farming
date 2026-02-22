const prisma = require('./lib/prisma');

async function connectDb() {
  await prisma.$connect();
  return prisma;
}

module.exports = connectDb;
