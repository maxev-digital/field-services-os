import prisma from '@/lib/prisma';
async function main() {
  const r = await prisma.$queryRaw`
    SELECT apn, owner_name, prop_address, prop_city, prop_zip, lat, lon, year_built, total_value, cad_source
    FROM parcels WHERE county = 'collin' LIMIT 3
  `;
  console.log('Collin samples:', JSON.stringify(r, null, 2));

  const r2 = await prisma.$queryRaw`
    SELECT apn, owner_name, prop_address, prop_city, prop_zip, lat, lon, year_built, total_value, cad_source
    FROM parcels WHERE county = 'denton' LIMIT 3
  `;
  console.log('Denton samples:', JSON.stringify(r2, null, 2));
  await prisma.$disconnect();
}
main();
