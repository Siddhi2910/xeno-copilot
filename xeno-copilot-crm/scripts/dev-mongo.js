const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');

(async () => {
  const mongod = await MongoMemoryServer.create({ instance: { dbName: 'xeno_copilot', port: 27777 } });
  const uri = mongod.getUri();
  fs.writeFileSync(path.join(__dirname, '..', '.mongo-uri'), uri);
  console.log('[dev-mongo] ready:', uri);
  process.on('SIGINT', () => void mongod.stop());
  process.on('SIGTERM', () => void mongod.stop());
})();
