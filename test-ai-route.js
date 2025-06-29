 // Run: node test-ai-routes.js
const baseUrl = 'https://atom-backend-production-8a1e.up.railway.app';

async function testAIRoutes() {
  console.log('🚀 Testing Fixed AI Routes...\n');

  // Test 1: AI Health
  try {
    const response = await fetch(`${baseUrl}/api/v1/ai/health`);
    console.log('✅ AI Health:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('   Response:', data);
    }
  } catch (error) {
    console.log('❌ AI Health failed:', error.message);
  }

  console.log();

  // Test 2: AI Status
  try {
    const response = await fetch(`${baseUrl}/api/v1/ai/status`);
    console.log('✅ AI Status:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('   Response:', data);
    }
  } catch (error) {
    console.log('❌ AI Status failed:', error.message);
  }

  console.log();

  // Test 3: AI Text Command
  try {
    const response = await fetch(`${baseUrl}/api/v1/ai/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        message: 'Hello Atom, can you help me with my construction project?' 
      })
    });
    
    console.log('✅ AI Text:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('   AI Response:', data.message);
      console.log('   Mode:', data.mode);
      console.log('   Conversation ID:', data.conversationId);
    } else {
      console.log('   Error:', await response.text());
    }
  } catch (error) {
    console.log('❌ AI Text failed:', error.message);
  }

  console.log();

  // Test 4: AI Voice Command (mock)
  try {
    const response = await fetch(`${baseUrl}/api/v1/ai/voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });
    
    console.log('✅ AI Voice:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('   AI Response:', data.message);
      console.log('   Transcription:', data.transcription);
      console.log('   Mode:', data.mode);
    }
  } catch (error) {
    console.log('❌ AI Voice failed:', error.message);
  }

  console.log('\n🎯 Results:');
  console.log('- All endpoints should return 200 status');
  console.log('- Responses should have "mode: mock"');
  console.log('- AI should give helpful construction-related responses');
  console.log('- Frontend should now connect successfully!');
}

testAIRoutes();
