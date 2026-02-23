require('dotenv').config();

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');

function randomPassword(length = 18) {
  return crypto
    .randomBytes(length)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, length);
}

function mergeRoles(roles) {
  const current = Array.isArray(roles) ? roles : [];
  return Array.from(new Set([...current, 'admin']));
}

async function main() {
  const email = String(process.env.ADMIN_SEED_EMAIL || 'admin@farming.local').trim().toLowerCase();
  const displayName = String(process.env.ADMIN_SEED_DISPLAY_NAME || 'System Admin').trim();
  const firstName = String(process.env.ADMIN_SEED_FIRST_NAME || 'System').trim();
  const lastName = String(process.env.ADMIN_SEED_LAST_NAME || 'Admin').trim();

  let rawPassword = String(process.env.ADMIN_SEED_PASSWORD || '').trim();
  let generated = false;
  if (!rawPassword) {
    rawPassword = randomPassword(20);
    generated = true;
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      userId: true,
      email: true,
      roles: true
    }
  });

  if (!existing) {
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const created = await prisma.user.create({
      data: {
        email,
        displayName: displayName || 'System Admin',
        firstName: firstName || 'System',
        lastName: lastName || 'Admin',
        password: passwordHash,
        roles: ['admin']
      },
      select: {
        userId: true,
        email: true,
        roles: true
      }
    });

    console.log('Admin user created');
    console.log(`email=${created.email}`);
    console.log(`roles=${created.roles.join(',')}`);
    console.log(`password=${rawPassword}`);
    console.log(`password_generated=${generated}`);
    return;
  }

  const data = {
    roles: mergeRoles(existing.roles)
  };

  // Optional password reset for existing admin when ADMIN_SEED_PASSWORD is provided.
  if (process.env.ADMIN_SEED_PASSWORD) {
    data.password = await bcrypt.hash(rawPassword, 10);
  }

  const updated = await prisma.user.update({
    where: { userId: existing.userId },
    data,
    select: {
      userId: true,
      email: true,
      roles: true
    }
  });

  console.log('Admin user updated');
  console.log(`email=${updated.email}`);
  console.log(`roles=${updated.roles.join(',')}`);
  if (process.env.ADMIN_SEED_PASSWORD) {
    console.log('password=UPDATED_FROM_ENV');
  } else {
    console.log('password=UNCHANGED');
  }
}

main()
  .catch((err) => {
    console.error('Seed admin failed');
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

