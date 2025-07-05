 // Save this as debug-api.js and run: node debug-api.js
const baseUrl = 'https://atom-backend-production-8a1e.up.railway.app';

async function testAPI() {
  console.log('🔍 Testing Backend API...\n');

  // Test 1: Health Check
  try {
    const healthResponse = await fetch(`${baseUrl}/api/v1/ai/health`);
    console.log('✅ Health Check:', healthResponse.status);
    if (healthResponse.ok) {
      const data = await healthResponse.json();
      console.log('   Response:', data);
    } else {
      console.log('   Error:', await healthResponse.text());
    }
  } catch (error) {
    console.log('❌ Health Check Failed:', error.message);
  }

  console.log();

  // Test 2: Status Check
  try {
    const statusResponse = await fetch(`${baseUrl}/api/v1/ai/status`);
    console.log('✅ Status Check:', statusResponse.status);
    if (statusResponse.ok) {
      const data = await statusResponse.json();
      console.log('   Response:', data);
    } else {
      console.log('   Error:', await statusResponse.text());
    }
  } catch (error) {
    console.log('❌ Status Check Failed:', error.message);
  }

  console.log();

  // Test 3: Text Command
  try {
    const textResponse = await fetch(`${baseUrl}/api/v1/ai/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'Hello Atom, can you hear me?' })
    });
    
    console.log('✅ Text Command:', textResponse.status);
    if (textResponse.ok) {
      const data = await textResponse.json();
      console.log('   AI Response:', data.message);
      console.log('   Conversation ID:', data.conversationId);
    } else {
      console.log('   Error:', await textResponse.text());
    }
  } catch (error) {
    console.log('❌ Text Command Failed:', error.message);
  }

  console.log('\n🏁 Done testing!');
}

testAPI();
