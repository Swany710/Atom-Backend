// debug-real-voice.js - Debug actual voice processing with real audio

const API_BASE = 'https://atom-backend-production-8a1e.up.railway.app/api/v1';
const fs = require('fs');

async function debugRealVoiceProcessing() {
    console.log('🎤 Debugging Real Voice Processing...\n');
    
    // Test 1: Check API health
    console.log('1️⃣ Checking API health...');
    try {
        const response = await fetch(`${API_BASE}/ai/health`);
        const data = await response.json();
        console.log('✅ Health Status:', response.status);
        console.log('   OpenAI Configured:', data.openaiConfigured);
        
        if (!data.openaiConfigured) {
            console.log('❌ FOUND ISSUE: OpenAI not configured!');
            console.log('   This would cause voice processing to fail');
            return;
        }
    } catch (error) {
        console.log('❌ Health check failed:', error.message);
        return;
    }
    
    // Test 2: Create a mock audio file to test actual audio processing
    console.log('\n2️⃣ Testing with mock audio file...');
    try {
        const FormData = require('form-data');
        const formData = new FormData();
        
        // Create a minimal WebM file (just enough to not be empty)
        const mockWebMData = Buffer.from([
            // WebM header
            0x1A, 0x45, 0xDF, 0xA3, // EBML
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23,
            0x42, 0x86, 0x81, 0x01, // DocType
            0x42, 0xF7, 0x81, 0x01,
            0x42, 0xF2, 0x81, 0x04,
            0x42, 0xF3, 0x81, 0x02,
            // Minimal audio data
            0x18, 0x53, 0x80, 0x67, // Segment
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x12,
            0x15, 0x49, 0xA9, 0x66, // Info
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0A,
            0x2A, 0xD7, 0xB1, 0x83, 0x0F, 0x42, 0x40, // TimecodeScale
        ]);
        
        formData.append('audio', mockWebMData, {
            filename: 'test-audio.webm',
            contentType: 'audio/webm'
        });
        formData.append('userId', 'debug-test');
        
        console.log('   Sending mock audio to voice endpoint...');
        console.log('   Audio size:', mockWebMData.length, 'bytes');
        
        const response = await fetch(`${API_BASE}/ai/voice-command1`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        console.log('✅ Voice Processing Status:', response.status);
        console.log('   Mode:', data.mode);
        console.log('   Message:', data.message);
        console.log('   Transcription field:', data.transcription || 'not present');
        
        // Analyze the response
        if (data.mode === 'error') {
            console.log('\n🔍 ERROR ANALYSIS:');
            if (data.message?.includes('multipart form')) {
                console.log('❌ Still getting FormData errors - deployment might not be complete');
            } else if (data.message?.includes('Audio format not supported')) {
                console.log('✅ FormData working, but Whisper rejects the audio format');
                console.log('   This is expected - mock audio isn\'t real speech');
            } else if (data.message?.includes('authentication')) {
                console.log('❌ OpenAI API key issues');
            } else if (data.message?.includes('rate limit')) {
                console.log('❌ OpenAI rate limit hit');
            } else {
                console.log('❓ Unknown error - needs investigation');
                console.log('   Full error:', data.error || 'no error details');
            }
        } else if (data.mode === 'openai') {
            console.log('🎉 Voice processing worked! (unexpected with mock audio)');
        }
        
    } catch (error) {
        console.log('❌ Mock audio test failed:', error.message);
    }
    
    // Test 3: Check what happens with larger audio file
    console.log('\n3️⃣ Testing with larger mock audio...');
    try {
        const FormData = require('form-data');
        const formData = new FormData();
        
        // Create a larger buffer that might be more similar to real audio
        const largerMockAudio = Buffer.alloc(18650); // Similar size to your real audio
        largerMockAudio.fill(0x42); // Fill with dummy data
        
        // Add some WebM headers at the beginning
        const webmHeader = Buffer.from([0x1A, 0x45, 0xDF, 0xA3]);
        webmHeader.copy(largerMockAudio, 0);
        
        formData.append('audio', largerMockAudio, {
            filename: 'larger-test.webm',
            contentType: 'audio/webm'
        });
        formData.append('userId', 'debug-large');
        
        console.log('   Sending larger mock audio...');
        console.log('   Audio size:', largerMockAudio.length, 'bytes (similar to your real audio)');
        
        const response = await fetch(`${API_BASE}/ai/voice-command1`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        console.log('✅ Larger Audio Status:', response.status);
        console.log('   Mode:', data.mode);
        console.log('   Message preview:', data.message?.substring(0, 100) + '...');
        
    } catch (error) {
        console.log('❌ Larger audio test failed:', error.message);
    }
    
    console.log('\n🎯 Voice Debug Summary:');
    console.log('======================');
    console.log('✅ If you see "Audio format not supported" → FormData is working, audio format issue');
    console.log('✅ If you see "authentication failed" → OpenAI API key issue');
    console.log('✅ If you see "rate limit" → Too many requests, wait a bit');
    console.log('❌ If you see "multipart form" → Deployment issue, old code still running');
    console.log('❌ If you see "Voice processing failed" → Generic error, need more debugging');
    
    console.log('\n🔧 Next Steps Based on Results:');
    console.log('1. Try voice in Chrome browser (best WebRTC support)');
    console.log('2. Try shorter voice clips (2-3 seconds)');
    console.log('3. Check microphone permissions in browser');
    console.log('4. Verify OpenAI API key has Whisper access');
}

// For Node.js environments
if (typeof fetch === 'undefined') {
    global.fetch = require('node-fetch');
    global.FormData = require('form-data');
}

debugRealVoiceProcessing().catch(console.error);