(async () => {
  const MV = require('./src/main/services/ModelVerifier');
  const v = new MV();
  const s = await v.getSystemStatus();
  console.log(JSON.stringify(s, null, 2));
})();
