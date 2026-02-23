require('dotenv').config();

const prisma = require('../src/lib/prisma');

const PIN_TYPE_CODE = 'PIN_DEF';
const PIN_TYPE_DESCRIPTION = 'ESP32 pin definitions';

const PIN_DEFINITIONS = [
  { confCode: 'pin16', confName: 'PIN16', confDescription: 'ESP32 GPIO 16', confValue: '16' },
  { confCode: 'pin17', confName: 'PIN17', confDescription: 'ESP32 GPIO 17', confValue: '17' },
  { confCode: 'pin18', confName: 'PIN18', confDescription: 'ESP32 GPIO 18', confValue: '18' },
  { confCode: 'pin19', confName: 'PIN19', confDescription: 'ESP32 GPIO 19', confValue: '19' }
];

async function main() {
  await prisma.configType.upsert({
    where: { typCode: PIN_TYPE_CODE },
    create: {
      typCode: PIN_TYPE_CODE,
      typDescription: PIN_TYPE_DESCRIPTION
    },
    update: {
      typDescription: PIN_TYPE_DESCRIPTION
    }
  });

  for (const pin of PIN_DEFINITIONS) {
    await prisma.configDetail.upsert({
      where: {
        typCode_confCode: {
          typCode: PIN_TYPE_CODE,
          confCode: pin.confCode
        }
      },
      create: {
        typCode: PIN_TYPE_CODE,
        confCode: pin.confCode,
        confName: pin.confName,
        confDescription: pin.confDescription,
        confValue: pin.confValue
      },
      update: {
        confName: pin.confName,
        confDescription: pin.confDescription,
        confValue: pin.confValue
      }
    });
  }

  console.log('PIN_DEF seeded successfully');
  console.log('Pins:', PIN_DEFINITIONS.map((pin) => pin.confValue).join(', '));
}

main()
  .catch((err) => {
    console.error('Seed PIN_DEF failed');
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
