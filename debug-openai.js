// Run: node debug-openai.js
require('dotenv').config();
const fs = require('fs');

async function testOpenAIConnection() {
  console.log('🔍 Testing OpenAI API Connection...\n');

  // Check if API key exists
  const apiKey = process.env.OPENAI_API_KEY;
  console.log('1. API Key Check:');
  console.log('   Key exists:', !!apiKey);
  console.log('   Key starts with sk-:', apiKey?.startsWith('sk-') || false);
  console.log('   Key length:', apiKey?.length || 0);
  console.log('   Key preview:', apiKey ? `${apiKey.substring(0, 20)}...${apiKey.slice(-8)}` : 'NOT FOUND');
  
  if (!apiKey) {
    console.log('❌ No OpenAI API key found in environment!');
    console.log('   Make sure OPENAI_API_KEY is set in your .env file');
    return;
  }

  console.log('\n2. Testing OpenAI API with fetch:');
  
  try {
    console.log('   🧠 Testing GPT API endpoint...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: 'Say hello in exactly 3 words.'
          }
        ],
        max_tokens: 10,
      })
    });

    console.log('   Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content;
      console.log('   ✅ GPT Response:', aiResponse);
      console.log('   ✅ OpenAI API is working correctly!');
    } else {
      const errorData = await response.json();
      console.log('   ❌ OpenAI API Error:');
      console.log('   Status:', response.status);
      console.log('   Error:', errorData.error?.message || errorData);
      
      if (response.status === 401) {
        console.log('\n🔧 Fix: Invalid API key (401 Unauthorized)');
        console.log('   - Your OpenAI API key is invalid or expired');
        console.log('   - Generate a new API key at https://platform.openai.com/api-keys');
        console.log('   - Make sure you copied the full key correctly');
      } else if (response.status === 429) {
        console.log('\n🔧 Fix: Rate limit or quota exceeded (429)');
        console.log('   - Check your OpenAI usage at https://platform.openai.com/usage');
        console.log('   - Add payment method if you\'re on free tier');
      } else if (response.status === 403) {
        console.log('\n🔧 Fix: API access forbidden (403)');
        console.log('   - Your API key might not have the required permissions');
        console.log('   - Check your OpenAI organization settings');
      }
    }

  } catch (error) {
    console.log('   ❌ Network Error:');
    console.log('   Error message:', error.message);
    console.log('\n🔧 Fix: Network issue');
    console.log('   - Check your internet connection');
    console.log('   - Check if OpenAI is accessible: https://status.openai.com/');
  }

  console.log('\n3. Environment Check:');
  console.log('   NODE_ENV:', process.env.NODE_ENV || 'not set');
  console.log('   Current working directory:', process.cwd());
  console.log('   .env file exists:', fs.existsSync('.env'));
  
  if (fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf8');
    const hasOpenAIKey = envContent.includes('OPENAI_API_KEY');
    console.log('   .env contains OPENAI_API_KEY:', hasOpenAIKey);
  }
}

testOpenAIConnection();