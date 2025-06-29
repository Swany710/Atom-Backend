 
// Run: node test-fixed-paths.js (after npm start)
const baseUrl = 'http://localhost:3000';

async function testFixedPaths() {
  console.log('🔍 Testing FIXED paths locally...\n');

  const endpoints = [
    { path: '/', name: 'Root' },
    { path: '/health', name: 'Original Health' },
    { path: '/test', name: 'Test Route' },
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
    }
  } catch (error) {
    console.log('❌ AI Text POST:', error.message);
  }

  console.log('\n🎯 If all show ✅, then push to GitHub for Railway deployment!');
}

testFixedPaths();