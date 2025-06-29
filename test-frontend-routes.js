// Run: node test-frontend-routes.js (after npm start)
const baseUrl = 'http://localhost:3000';

async function testFrontendRoutes() {
  console.log('🔍 Testing EXACT frontend routes...\n');

  // Test the exact routes your frontend is calling
  const testCases = [
    {
      method: 'GET',
      path: '/api/v1/ai/health',
      name: 'AI Health'
    },
    {
      method: 'GET', 
      path: '/api/v1/ai/status',
      name: 'AI Status'
    },
    {
      method: 'POST',
      path: '/api/v1/ai/text-command1',
      name: 'AI Text Command1 (exact frontend call)',
      body: { message: 'Hello Atom, can you help me plan a construction project?' }
    },
    {
      method: 'POST',
      path: '/api/v1/ai/voice-command1', 
      name: 'AI Voice Command1 (exact frontend call)',
      body: {}
    }
  ];

  for (const test of testCases) {
    try {
      const options = {
        method: test.method,
        headers: { 'Content-Type': 'application/json' }
      };

      if (test.body) {
        options.body = JSON.stringify(test.body);
      }

      const response = await fetch(`${baseUrl}${test.path}`, options);
      
      console.log(`${response.ok ? '✅' : '❌'} ${test.name}: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.message) {
          console.log(`   AI Response: ${data.message.substring(0, 80)}...`);
        } else {
          console.log(`   Response:`, data);
        }
        if (data.mode) {
          console.log(`   Mode: ${data.mode}`);
        }
      } else {
        const errorText = await response.text();
        console.log(`   Error: ${errorText}`);
      }
      
    } catch (error) {
      console.log(`❌ ${test.name}: ${error.message}`);
    }
    
    console.log(); // Empty line
  }

  console.log('🎯 If all routes return ✅ 200, your frontend should work!');
  console.log('🚀 Push to GitHub and your AI assistant will be live!');
}

testFrontendRoutes();