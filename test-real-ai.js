// Run: node test-real-ai.js (after npm start)
const baseUrl = 'http://localhost:3000';

async function testRealAI() {
  console.log('🤖 Testing REAL AI Processing...\n');

  // Test 1: AI Health Check
  try {
    const response = await fetch(`${baseUrl}/api/v1/ai/health`);
    console.log('✅ AI Health:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('   Service:', data.service);
    }
  } catch (error) {
    console.log('❌ AI Health failed:', error.message);
  }

  console.log();

  // Test 2: AI Status Check  
  try {
    const response = await fetch(`${baseUrl}/api/v1/ai/status`);
    console.log('✅ AI Status:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('   Mode:', data.mode);
      console.log('   AI Service:', data.aiService);
    }
  } catch (error) {
    console.log('❌ AI Status failed:', error.message);
  }

  console.log();

  // Test 3: Real AI Text Processing
  try {
    console.log('🧠 Testing real OpenAI text processing...');
    
    const response = await fetch(`${baseUrl}/api/v1/ai/text-command1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: 'Hi Atom! Can you help me plan my day? I have a meeting at 2pm, need to grocery shop, and want to exercise. How should I organize my schedule?',
        userId: 'test-user'
      })
    });
    
    console.log('✅ AI Text Processing:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('   Mode:', data.mode);
      console.log('   Conversation ID:', data.conversationId);
      console.log('   AI Response Preview:', data.message.substring(0, 100) + '...');
      console.log('   Full AI Response:', data.message);
      
      // Test follow-up message in same conversation
      console.log('\n🔄 Testing conversation memory...');
      
      const followUpResponse = await fetch(`${baseUrl}/api/v1/ai/text-command1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: 'What time should I do the grocery shopping to be most efficient?',
          userId: 'test-user',
          conversationId: data.conversationId
        })
      });
      
      if (followUpResponse.ok) {
        const followUpData = await followUpResponse.json();
        console.log('   Follow-up Response:', followUpData.message.substring(0, 100) + '...');
      }
      
    } else {
      const errorText = await response.text();
      console.log('   Error:', errorText);
    }
  } catch (error) {
    console.log('❌ AI Text Processing failed:', error.message);
  }

  console.log();

  // Test 4: Mock Voice Processing (since we can't easily send audio files in this test)
  try {
    console.log('🎤 Testing voice endpoint (without audio file)...');
    
    const response = await fetch(`${baseUrl}/api/v1/ai/voice-command1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'test-user' })
    });
    
    console.log('✅ Voice Endpoint Status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('   Response:', data.message);
    } else {
      const errorText = await response.text();
      console.log('   Expected Error (no audio file):', errorText);
    }
  } catch (error) {
    console.log('❌ Voice endpoint test failed:', error.message);
  }

  console.log('\n🎯 Results Summary:');
  console.log('- If AI Text shows real responses about daily planning → OpenAI working!');
  console.log('- If Mode shows "openai" → Real AI integration active');
  console.log('- If conversation memory works → Follow-up responses reference your schedule question');
  console.log('- Voice will work when frontend sends actual audio files');
  
  console.log('\n🚀 If tests pass, push to GitHub and your AI will be fully functional!');
}

testRealAI();