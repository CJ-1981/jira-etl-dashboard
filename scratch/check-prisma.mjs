import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  try {
    console.log('Attempting to connect to Prisma...')
    // Just try to instantiate and check if we can access a model
    console.log('Prisma models available:', Object.keys(prisma).filter(k => !k.startsWith('_')))
    console.log('SUCCESS: Prisma client loaded correctly')
  } catch (err) {
    console.error('FAILURE: Could not load Prisma client', err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
