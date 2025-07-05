// Run: node test-endpoints.js (while server is running)
require('dotenv').config();

async function testEndpoints() {
  console.log('🧪 Testing Both Text and Voice Endpoints...\n');

  const baseUrl = 'http://localhost:3000';

  // Test 1: Health Check
  console.log('1. Testing Health Endpoints:');
  try {
    const healthResponse = await fetch(`${baseUrl}/api/v1/ai/health`);
    console.log('   AI Health:', healthResponse.status);
    if (healthResponse.ok) {
      const data = await healthResponse.json();
      console.log('   Service:', data.service);
    }

    const statusResponse = await fetch(`${baseUrl}/api/v1/ai/status`);
    console.log('   AI Status:', statusResponse.status);
    if (statusResponse.ok) {
      const data = await statusResponse.json();
      console.log('   Mode:', data.mode);
    }
  } catch (error) {
    console.log('   ❌ Health check failed:', error.message);
  }

  console.log('\n2. Testing Text Commands:');

  // Test all text endpoints
  const textEndpoints = [
    '/api/v1/ai/text-command1',
    '/api/v1/ai/text-command', 
    '/api/v1/ai/text'
  ];

  for (const endpoint of textEndpoints) {
    try {
      console.log(`   Testing ${endpoint}:`);
      
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: 'Hello Atom! Can you help me organize my day? I have meetings, errands, and want to exercise.',
          userId: 'test-user'
        })
      });
      
      console.log(`     Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`     Mode: ${data.mode}`);
        console.log(`     Response preview: ${data.message.substring(0, 80)}...`);
        if (data.mode === 'openai') {
          console.log('     ✅ OpenAI working!');
        } else {
          console.log('     ⚠️ Not using OpenAI:', data.mode);
        }
      } else {
        const errorText = await response.text();
        console.log(`     ❌ Error: ${errorText}`);
      }
    } catch (error) {
      console.log(`     ❌ Failed: ${error.message}`);
    }
  }

  console.log('\n3. Testing Voice Endpoints (without audio):');

  const voiceEndpoints = [
    '/api/v1/ai/voice-command1',
    '/api/v1/ai/voice-command',
    '/api/v1/ai/voice'
  ];

  for (const endpoint of voiceEndpoints) {
    try {
      console.log(`   Testing ${endpoint}:`);
      
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test-user' })
      });
      
      console.log(`     Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`     Mode: ${data.mode}`);
        console.log(`     Message: ${data.message.substring(0, 60)}...`);
        console.log('     ✅ Voice endpoint accessible');
      } else {
        const errorText = await response.text();
        console.log(`     Response: ${errorText}`);
      }
    } catch (error) {
      console.log(`     ❌ Failed: ${error.message}`);
    }
  }

  console.log('\n4. Environment Check:');
  const apiKey = process.env.OPENAI_API_KEY;
  console.log('   OpenAI API Key exists:', !!apiKey);
  console.log('   Key starts with sk-:', apiKey?.startsWith('sk-') || false);
  console.log('   Key length:', apiKey?.length || 0);

  console.log('\n🎯 Results Summary:');
  console.log('✅ If text endpoints return OpenAI responses → Backend working');
  console.log('✅ If voice endpoints are accessible → Ready for audio');
  console.log('⚠️ Frontend audio recording needs to be fixed separately');
  console.log('🎤 For voice: Check browser microphone permissions');
}

testEndpoints();