 
// Run: node test-global-prefix.js (after npm start)
const baseUrl = 'http://localhost:3000';

async function testGlobalPrefix() {
  console.log('🔍 Testing with global prefix...\n');

  const endpoints = [
    { path: '/', name: 'Root (excluded from prefix)' },
    { path: '/health', name: 'Health (excluded from prefix)' },
    { path: '/api/v1/test', name: 'Test (with global prefix)' },
    { path: '/api/v1/ai/health', name: 'AI Health (should work now!)' },
    { path: '/api/v1/ai/status', name: 'AI Status (should work now!)' },
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint.path}`);
      console.log(`${response.ok ? '✅' : '❌'} ${endpoint.name}: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   Response:`, data.message || data.status || 'OK');
      } else {
        const errorText = await response.text();
        console.log(`   Error:`, errorText);
      }
    } catch (error) {
      console.log(`❌ ${endpoint.name}: ${error.message}`);
    }
  }

  console.log('\n📋 Testing POST endpoint...');
  
  try {
    const response = await fetch(`${baseUrl}/api/v1/ai/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello Atom!' })
    });
    
    console.log(`${response.ok ? '✅' : '❌'} AI Text POST: ${response.status}`);
    if (response.ok) {
      const data = await response.json();
      console.log('   AI Response:', data.message);
    } else {
      const errorText = await response.text();
      console.log('   Error:', errorText);
    }
  } catch (error) {
    console.log('❌ AI Text POST:', error.message);
  }

  console.log('\n🎯 Expected routes after fix:');
  console.log('✅ GET /api/v1/ai/health');
  console.log('✅ GET /api/v1/ai/status'); 
  console.log('✅ POST /api/v1/ai/text');
  console.log('✅ POST /api/v1/ai/voice');
}

testGlobalPrefix();