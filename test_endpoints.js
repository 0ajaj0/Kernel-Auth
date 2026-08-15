const { handler } = require('./netlify/functions/v2-router.js');

async function testEndpoint(endpoint, body) {
  const event = {
    httpMethod: 'POST',
    path: `/api/v2/${endpoint}`,
    queryStringParameters: { endpoint },
    body: JSON.stringify(body),
    headers: { 'x-forwarded-for': '127.0.0.1' },
    isBase64Encoded: false,
  };

  const response = await handler(event);
  return JSON.parse(response.body);
}

async function run() {
  console.log('--- Creating App for test ---');
  const { createApp, store } = require('./netlify/functions/_store.js');
  const app = await createApp({ app_name: 'Test App', version: '1.0' });
  
  console.log('--- Test Init ---');
  const initRes = await testEndpoint('init', { owner_id: app.owner_id, app_name: app.app_name, secret: app.secret });
  console.log(initRes);
  const sessionId = initRes.session_id;

  console.log('\n--- Test variables/set ---');
  const varSet = await testEndpoint('variables/set', { session_id: sessionId, key: 'test_key', value: '123' });
  console.log(varSet);

  console.log('\n--- Test device-auth ---');
  const devAuth = await testEndpoint('device-auth', { session_id: sessionId, hwid: 'ABC-123' });
  console.log(devAuth);

  console.log('\n--- Test chats/send ---');
  const chatSend = await testEndpoint('chats/send', { session_id: sessionId, username: 'tester', message: 'Hello world' });
  console.log(chatSend);

  console.log('\n--- Test chats/get ---');
  const chatGet = await testEndpoint('chats/get', { session_id: sessionId });
  console.log(chatGet);

  console.log('\n--- Test blacklist/check ---');
  const blCheck = await testEndpoint('blacklist/check', { session_id: sessionId, hwid: 'ABC-123' });
  console.log(blCheck);

  console.log('\nAll tests passed!');
}

run().catch(console.error);
