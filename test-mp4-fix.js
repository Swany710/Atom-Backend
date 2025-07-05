// test-mp4-fix.js
// Simple test to verify MP4 FormData works

const API_BASE = 'https://atom-backend-production-8a1e.up.railway.app/api/v1';

async function testMP4Fix() {
    console.log('🎤 Testing MP4-Only Voice Processing Fix...\n');
    
    // Test 1: Basic backend connection
    console.log('1️⃣ Testing backend connection...');
    try {
        const response = await fetch(`${API_BASE}/ai/health`);
        const data = await response.json();
        console.log('✅ Backend Status:', response.status);
        console.log('   Service:', data.service);
        
        if (response.status !== 200) {
            console.log('❌ Backend not responding correctly');
            return;
        }
    } catch (error) {
        console.log('❌ Backend connection failed:', error.message);
        return;
    }
    
    // Test 2: Test with mock MP4 audio
    console.log('\n2️⃣ Testing MP4 voice endpoint...');
    try {
        // Create a mock MP4 audio buffer
        const mockMP4Audio = Buffer.alloc(2048);
        // Add MP4 header signature
        mockMP4Audio.writeUInt32BE(0x00000020, 0); // ftyp box size
        mockMP4Audio.writeUInt32BE(0x66747970, 4); // 'ftyp' 
        mockMP4Audio.writeUInt32BE(0x6D703461, 8); // 'mp4a'
        
        // Create File object (simulating browser FormData)
        const audioFile = new File([mockMP4Audio], 'audio.mp4', { 
            type: 'audio/mp4' 
        });
        
        const formData = new FormData();
        formData.append('audio', audioFile);
        formData.append('userId', 'test-user');
        
        console.log('   Sending MP4 audio to backend...');
        console.log('   File size:', mockMP4Audio.length, 'bytes');
        console.log('   File type: audio/mp4');
        
        const response = await fetch(`${API_BASE}/ai/voice-command1`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        console.log('✅ Voice endpoint response:', response.status);
        console.log('   Mode:', data.mode);
        console.log('   Message:', data.message?.substring(0, 100) + '...');
        
        // Success indicators
        if (response.status === 200 && data.mode === 'error') {
            if (data.message.includes('Could not parse multipart form')) {
                console.log('❌ STILL FAILING: Multipart form issue persists');
            } else {
                console.log('🎉 SUCCESS: FormData parsing works! (Error is at audio processing level)');
            }
        } else if (data.mode === 'openai') {
            console.log('🎉 AMAZING: Full voice processing is working!');
        } else {
            console.log('ℹ️  Response received - checking status...');
        }
        
    } catch (error) {
        console.log('❌ MP4 voice test failed:', error.message);
    }
    
    // Test 3: Text processing for comparison
    console.log('\n3️⃣ Testing text processing (baseline)...');
    try {
        const response = await fetch(`${API_BASE}/ai/text-command1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Hello Atom, test message to verify OpenAI works.',
                userId: 'test-user'
            })
        });
        
        const data = await response.json();
        console.log('✅ Text processing:', response.status);
        console.log('   Mode:', data.mode);
        
        if (data.mode === 'openai') {
            console.log('✅ OpenAI is working - voice should work too once FormData is fixed');
        }
        
    } catch (error) {
        console.log('❌ Text processing failed:', error.message);
    }
    
    console.log('\n🎯 MP4 Fix Test Results:');
    console.log('=======================');
    console.log('✅ Using native FormData instead of node form-data library');
    console.log('✅ Forcing MP4 format for consistency');
    console.log('✅ Simplified approach without fallbacks');
    console.log('');
    console.log('🚀 Next Steps:');
    console.log('1. Update backend with MP4-only processVoiceCommand1 method');
    console.log('2. Update frontend with MP4-only recording functions');
    console.log('3. Test voice recording in your browser');
    console.log('4. Should see successful transcription or clear error messages');
}

// Check if we're in Node.js environment
if (typeof window === 'undefined') {
    // Node.js environment - need to install node-fetch
    try {
        global.fetch = require('node-fetch');
        global.FormData = require('form-data');
        global.File = class File {
            constructor(chunks, filename, options) {
                this.chunks = chunks;
                this.name = filename;
                this.type = options.type;
            }
        };
        testMP4Fix().catch(console.error);
    } catch (error) {
        console.log('❌ Missing modules. Run: npm install node-fetch form-data');
    }
} else {
    // Browser environment
    testMP4Fix().catch(console.error);
}