 
// Run: node deployment-debug.js
const baseUrl = 'https://atom-backend-production-8a1e.up.railway.app';

async function checkDeployment() {
  console.log('🔍 Checking what\'s actually deployed...\n');

  // Test root endpoint
  try {
    const rootResponse = await fetch(`${baseUrl}/`);
    console.log('✅ Root endpoint (/):', rootResponse.status);
    if (rootResponse.ok) {
      const data = await rootResponse.json();
      console.log('   Response:', data);
    } else {
      console.log('   Error:', await rootResponse.text());
    }
  } catch (error) {
    console.log('❌ Root endpoint failed:', error.message);
  }

  console.log();

  // Test old AI endpoints (in case new ones didn't deploy)
  const testEndpoints = [
    '/ai/health',
    '/ai/status', 
    '/ai/text-command',
    '/voice/voice-command',
    '/api/v1/ai/health',
    '/api/v1/ai/status',
    '/api/v1/ai/text',
    '/health'
  ];

  for (const endpoint of testEndpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`);
      console.log(`${response.ok ? '✅' : '❌'} ${endpoint}: ${response.status}`);
      
      if (response.ok && endpoint.includes('health')) {
        const data = await response.json();
        console.log('   Response:', data);
      }
    } catch (error) {
      console.log(`❌ ${endpoint}: ${error.message}`);
    }
  }

  console.log('\n🎯 Analysis:');
  console.log('- If root (/) works but /api/v1/ai/* don\'t → Routes not registered');
  console.log('- If nothing works → App not deployed or crashed');
  console.log('- If old routes work → New code didn\'t deploy');
}

checkDeployment();