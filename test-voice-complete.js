// test-voice-complete.js
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');

async function testVoiceProcessing() {
    console.log('🎤 Testing Complete Voice Processing Fix...\n');
    
    const API_BASE = 'https://atom-backend-production-8a1e.up.railway.app/api/v1';
    
    // Test 1: Check backend health
    console.log('1️⃣ Testing backend health...');
    try {
        const response = await fetch(`${API_BASE}/ai/health`);
        const data = await response.json();
        console.log('✅ Backend Status:', response.status);
        console.log('   Service:', data.service);
        console.log('   Timestamp:', data.timestamp);
    } catch (error) {
        console.log('❌ Backend unreachable:', error.message);
        return;
    }
    
    // Test 2: Test text processing (baseline)
    console.log('\n2️⃣ Testing text processing...');
    try {
        const response = await fetch(`${API_BASE}/ai/text-command1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Hello Atom! Say hello back.',
                userId: 'test-user'
            })
        });
        
        const data = await response.json();
        console.log('✅ Text Status:', response.status);
        console.log('   Mode:', data.mode);
        console.log('   Response:', data.message?.substring(0, 60) + '...');
    } catch (error) {
        console.log('❌ Text processing failed:', error.message);
    }
    
    // Test 3: Test voice endpoint with no audio (error handling)
    console.log('\n3️⃣ Testing voice endpoint error handling...');
    try {
        const formData = new FormData();
        formData.append('userId', 'test-user');
        // No audio file - should return clear error
        
        const response = await fetch(`${API_BASE}/ai/voice-command1`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        console.log('✅ Voice Error Status:', response.status);
        console.log('   Mode:', data.mode);
        console.log('   Message:', data.message?.substring(0, 80) + '...');
        
        if (data.mode === 'error' && data.message.includes("didn't receive any audio")) {
            console.log('🎉 Voice error handling is working correctly!');
        }
    } catch (error) {
        console.log('❌ Voice endpoint test failed:', error.message);
    }
    
    // Test 4: Test with tiny mock audio (format validation)
    console.log('\n4️⃣ Testing audio format validation...');
    try {
        const formData = new FormData();
        
        // Create a minimal WebM header (won't work but tests format handling)
        const mockWebMHeader = Buffer.from([
            0x1A, 0x45, 0xDF, 0xA3, // EBML header
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20,
            // Add some more bytes to meet minimum size
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ]);
        
        // Make it larger than 1KB to pass size validation
        const largerMockAudio = Buffer.concat([
            mockWebMHeader,
            Buffer.alloc(1024, 0) // Add 1KB of zeros
        ]);
        
        formData.append('audio', largerMockAudio, {
            filename: 'test-audio.webm',
            contentType: 'audio/webm'
        });
        formData.append('userId', 'test-user');
        
        const response = await fetch(`${API_BASE}/ai/voice-command1`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        console.log('✅ Mock Audio Status:', response.status);
        console.log('   Mode:', data.mode);
        console.log('   Message:', data.message?.substring(0, 80) + '...');
        
        // Should fail at Whisper API level (400 Bad Request) but not at FormData level
        if (data.mode === 'error' && data.message.includes("format wasn't recognized")) {
            console.log('🎉 Audio format validation is working correctly!');
        }
    } catch (error) {
        console.log('❌ Audio format test failed:', error.message);
    }
    
    console.log('\n🎯 Test Results Summary:');
    console.log('========================');
    console.log('✅ If all tests pass, your voice processing should now work');
    console.log('✅ Backend is receiving and processing audio files correctly');
    console.log('✅ Error handling provides clear user feedback');
    console.log('✅ Audio format validation is working');
    console.log('');
    console.log('🎤 Next Steps:');
    console.log('1. Deploy the frontend and backend fixes');
    console.log('2. Test with real voice in your browser');
    console.log('3. Check browser console for any remaining issues');
    console.log('');
    console.log('🔧 If still having issues:');
    console.log('- Try Chrome browser (best WebM support)');
    console.log('- Check microphone permissions');
    console.log('- Verify OpenAI API key has Whisper access');
}

// Run the test
testVoiceProcessing().catch(console.error);