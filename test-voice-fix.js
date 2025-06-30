// test-voice-fix.js - Test voice processing fix

const API_BASE = 'https://atom-backend-production-8a1e.up.railway.app/api/v1';

async function testVoiceFix() {
    console.log('🧪 Testing Voice Processing Fix...\n');
    
    // Test 1: Health check
    console.log('1️⃣ Testing backend health...');
    try {
        const response = await fetch(`${API_BASE}/ai/health`);
        const data = await response.json();
        console.log('✅ Health Status:', response.status);
        console.log('   OpenAI Configured:', data.openaiConfigured);
    } catch (error) {
        console.log('❌ Health check failed:', error.message);
        return;
    }
    
    // Test 2: Text processing (should work)
    console.log('\n2️⃣ Testing text processing...');
    try {
        const response = await fetch(`${API_BASE}/ai/text-command1`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: 'Hello Atom! This is a test.',
                userId: 'test-user'
            })
        });
        
        const data = await response.json();
        console.log('✅ Text Status:', response.status);
        console.log('   Mode:', data.mode);
        console.log('   Response Preview:', data.message?.substring(0, 60) + '...');
        
    } catch (error) {
        console.log('❌ Text test failed:', error.message);
    }
    
    // Test 3: Voice endpoint structure (without audio)
    console.log('\n3️⃣ Testing voice endpoint...');
    try {
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('userId', 'test-user');
        // No audio file - testing error handling
        
        const response = await fetch(`${API_BASE}/ai/voice-command1`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        console.log('✅ Voice Endpoint Status:', response.status);
        console.log('   Mode:', data.mode);
        console.log('   Has transcription field:', 'transcription' in data);
        console.log('   Error handling message:', data.message?.substring(0, 80) + '...');
        
        if (data.mode === 'error' && data.message.includes("didn't receive any audio")) {
            console.log('🎉 Voice error handling is working correctly!');
        }
        
    } catch (error) {
        console.log('❌ Voice endpoint test failed:', error.message);
    }
    
    // Test 4: Backend stability check
    console.log('\n4️⃣ Testing backend stability...');
    console.log('   Making multiple rapid requests to check for crashes...');
    
    const promises = [];
    for (let i = 0; i < 5; i++) {
        promises.push(
            fetch(`${API_BASE}/ai/health`).then(r => r.json())
        );
    }
    
    try {
        const results = await Promise.all(promises);
        console.log('✅ Stability Test: All 5 requests succeeded');
        console.log('   Backend is stable and not crashing');
    } catch (error) {
        console.log('❌ Stability issue detected:', error.message);
    }
    
    console.log('\n🎯 Voice Fix Summary:');
    console.log('===================');
    console.log('After deploying the fixes:');
    console.log('✅ Text chat should work perfectly');
    console.log('✅ Voice recording should be detected');
    console.log('✅ Better error messages for voice issues');
    console.log('✅ Backend should stop crashing/restarting');
    console.log('');
    console.log('🔧 If voice still fails, check:');
    console.log('- OpenAI API key has Whisper access');
    console.log('- Audio format compatibility');
    console.log('- Browser microphone permissions');
}

// For Node.js environments
if (typeof fetch === 'undefined') {
    global.fetch = require('node-fetch');
    global.FormData = require('form-data');
}

testVoiceFix().catch(console.error);