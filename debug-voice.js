// Run: node debug-voice.js
const fs = require('fs');

async function debugVoiceProcessing() {
  console.log('🎤 Debugging Voice Processing...\n');

  const baseUrl = 'http://localhost:3000';

  // Test 1: Check if voice endpoint is accessible
  console.log('1. Testing voice endpoint accessibility:');
  try {
    const response = await fetch(`${baseUrl}/api/v1/ai/voice-command1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'no audio file' })
    });
    
    console.log('   Voice endpoint status:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('   Response:', data.message);
    } else {
      const errorText = await response.text();
      console.log('   Error:', errorText);
    }
  } catch (error) {
    console.log('   ❌ Endpoint not accessible:', error.message);
  }

  console.log('\n2. Testing with mock audio file:');
  
  try {
    // Create a simple FormData with mock audio
    const FormData = require('form-data');
    const form = new FormData();
    
    // Create a simple buffer as mock audio
    const mockAudioBuffer = Buffer.from('mock audio data for testing');
    form.append('audio', mockAudioBuffer, {
      filename: 'test-audio.wav',
      contentType: 'audio/wav'
    });
    
    const response = await fetch(`${baseUrl}/api/v1/ai/voice-command1`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    console.log('   Mock audio test status:', response.status);
    const data = await response.json();
    console.log('   Response mode:', data.mode);
    console.log('   Response message:', data.message);
    console.log('   Transcription:', data.transcription);
    
  } catch (error) {
    console.log('   ❌ Mock audio test failed:', error.message);
  }

  console.log('\n3. Frontend debugging tips:');
  console.log('   🔍 Check browser console for errors');
  console.log('   🔍 Verify audio is being recorded properly');
  console.log('   🔍 Check if audio file is being sent in FormData');
  console.log('   🔍 Confirm audio format (WAV, MP3, M4A supported)');
  
  console.log('\n4. Backend debugging:');
  console.log('   🔍 Check server logs for file upload errors');
  console.log('   🔍 Verify multer is handling file uploads');
  console.log('   🔍 Check if OpenAI Whisper is receiving valid audio');
}

debugVoiceProcessing();