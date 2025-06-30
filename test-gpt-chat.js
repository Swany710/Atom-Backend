// test-gpt-chat.js - Test your GPT chat setup
const fetch = require('node-fetch');

const baseUrl = 'https://atom-backend-production-8a1e.up.railway.app';

async function testGPTChat() {
    console.log('🧪 Testing GPT Chat Setup...\n');
    
    // Test 1: Check if backend is running
    console.log('1️⃣ Testing Backend Connection...');
    try {
        const response = await fetch(`${baseUrl}/health`);
        const data = await response.json();
        console.log('✅ Backend Status:', response.status);
        console.log('   Response:', data);
    } catch (error) {
        console.log('❌ Backend Connection Failed:', error.message);
        return;
    }
    
    // Test 2: Check AI status
    console.log('\n2️⃣ Testing AI Status...');
    try {
        const response = await fetch(`${baseUrl}/api/v1/ai/status`);
        const data = await response.json();
        console.log('✅ AI Status:', response.status);
        console.log('   AI Service:', data.aiService);
        console.log('   Mode:', data.mode);
        console.log('   OpenAI Configured:', data.status);
    } catch (error) {
        console.log('❌ AI Status Failed:', error.message);
    }
    
    // Test 3: Try text chat
    console.log('\n3️⃣ Testing Text Chat...');
    try {
        const response = await fetch(`${baseUrl}/api/v1/ai/text-command1`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: 'Hello Atom! Can you help me plan my day?',
                userId: 'test-user'
            })
        });
        
        const data = await response.json();
        console.log('✅ Text Chat Status:', response.status);
        console.log('   Mode:', data.mode);
        console.log('   AI Response Preview:', data.message?.substring(0, 100) + '...');
        
        if (data.mode === 'openai') {
            console.log('🎉 GPT Chat is working!');
        } else {
            console.log('⚠️  GPT Chat has issues:', data.mode);
        }
        
    } catch (error) {
        console.log('❌ Text Chat Failed:', error.message);
    }
    
    // Test 4: Try alternative routes
    console.log('\n4️⃣ Testing Alternative Routes...');
    const routes = [
        '/api/v1/ai/text-command',
        '/api/v1/ai/text'
    ];
    
    for (const route of routes) {
        try {
            const response = await fetch(`${baseUrl}${route}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: 'Test message',
                    userId: 'test'
                })
            });
            
            console.log(`✅ ${route}: ${response.status}`);
            
        } catch (error) {
            console.log(`❌ ${route}: Failed`);
        }
    }
    
    console.log('\n🎯 Summary:');
    console.log('- If all tests show ✅ and Mode: openai → GPT chat is working!');
    console.log('- If you see errors → We need to fix the backend setup');
    console.log('- If Mode: error → OpenAI API key issue');
}

// Run the test
testGPTChat().catch(console.error);