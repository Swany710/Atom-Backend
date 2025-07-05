// deployment-check.js - Check if the new fix is deployed

const API_BASE = 'https://atom-backend-production-8a1e.up.railway.app/api/v1';

async function checkDeploymentStatus() {
    console.log('🔍 Checking Deployment Status...\n');
    
    // Test 1: Check if the new error handling is deployed
    console.log('1️⃣ Testing voice endpoint with no audio (should show new error message)...');
    try {
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('userId', 'test-user');
        // No audio file
        
        const response = await fetch(`${API_BASE}/ai/voice-command1`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        console.log('✅ Voice Endpoint Status:', response.status);
        console.log('   Error Message:', data.message);
        
        // Check if we have the NEW error message
        if (data.message?.includes("didn't receive any audio")) {
            console.log('🎉 NEW VERSION DEPLOYED! ✅');
            console.log('   - Improved error handling is active');
            console.log('   - Whisper FormData fix is deployed');
        } else if (data.message?.includes("Voice processing failed")) {
            console.log('❌ OLD VERSION STILL RUNNING');
            console.log('   - Generic error messages');
            console.log('   - Whisper fix not deployed yet');
        } else {
            console.log('🤔 UNKNOWN VERSION');
            console.log('   - Different error message than expected');
        }
        
    } catch (error) {
        console.log('❌ Deployment check failed:', error.message);
    }
    
    // Test 2: Check text processing (baseline)
    console.log('\n2️⃣ Testing text processing...');
    try {
        const response = await fetch(`${API_BASE}/ai/text-command1`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: 'Hello, just testing if you are working',
                userId: 'deployment-test'
            })
        });
        
        const data = await response.json();
        console.log('✅ Text Status:', response.status);
        console.log('   Mode:', data.mode);
        console.log('   Response preview:', data.message?.substring(0, 60) + '...');
        
        if (data.mode === 'openai') {
            console.log('✅ Text chat is working perfectly');
        }
        
    } catch (error) {
        console.log('❌ Text test failed:', error.message);
    }
    
    console.log('\n🎯 Deployment Analysis:');
    console.log('======================');
    
    console.log('If you see "NEW VERSION DEPLOYED":');
    console.log('  ✅ The Whisper fix is active');
    console.log('  ✅ Try voice again - should get specific error messages');
    console.log('  ✅ Voice might actually work now');
    
    console.log('\nIf you see "OLD VERSION STILL RUNNING":');
    console.log('  🚀 Need to redeploy the fixed controller');
    console.log('  📝 Railway might need a few minutes to deploy');
    console.log('  🔄 Try: git push origin master (force redeploy)');
    
    console.log('\n📋 Quick Fix Commands:');
    console.log('  git add .');
    console.log('  git commit -m "Force deploy Whisper fix"');
    console.log('  git push origin master');
    console.log('  railway logs --tail (monitor deployment)');
}

// For Node.js environments
if (typeof fetch === 'undefined') {
    global.fetch = require('node-fetch');
    global.FormData = require('form-data');
}

checkDeploymentStatus().catch(console.error);