#!/usr/bin/env node

/**
 * Atom AI Assistant - Deployment Verification Script
 *
 * This script tests your Railway deployment to ensure everything is working.
 *
 * Usage:
 *   node verify-deployment.js https://your-app.up.railway.app
 */

const https = require('https');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: [],
};

// Get backend URL from command line
const BACKEND_URL = process.argv[2];

if (!BACKEND_URL) {
  console.error(`${colors.red}❌ Error: Please provide your backend URL${colors.reset}`);
  console.log(`\nUsage: node verify-deployment.js https://your-app.up.railway.app\n`);
  process.exit(1);
}

console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   Atom AI Assistant - Deployment Verification           ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
${colors.reset}\n`);

console.log(`${colors.blue}Testing backend at: ${colors.bright}${BACKEND_URL}${colors.reset}\n`);

// Helper function to make HTTP requests
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BACKEND_URL);
    const requestOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = https.request(url, requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// Test functions
async function testHealth() {
  console.log(`${colors.cyan}[1/7] Testing Health Endpoint...${colors.reset}`);

  try {
    const { status, data } = await makeRequest('/api/v1/ai/health');

    if (status === 200 && data.status === 'healthy') {
      console.log(`${colors.green}  ✅ Health check passed${colors.reset}`);
      console.log(`     Service: ${data.service}`);
      results.passed++;
      results.tests.push({ name: 'Health Check', status: 'PASS' });
      return true;
    } else {
      console.log(`${colors.red}  ❌ Health check failed${colors.reset}`);
      console.log(`     Status: ${status}, Response:`, data);
      results.failed++;
      results.tests.push({ name: 'Health Check', status: 'FAIL' });
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}  ❌ Health check failed - ${error.message}${colors.reset}`);
    results.failed++;
    results.tests.push({ name: 'Health Check', status: 'FAIL', error: error.message });
    return false;
  }
}

async function testStatus() {
  console.log(`\n${colors.cyan}[2/7] Testing Status Endpoint...${colors.reset}`);

  try {
    const { status, data } = await makeRequest('/api/v1/ai/status');

    if (status === 200) {
      console.log(`${colors.green}  ✅ Status check passed${colors.reset}`);
      console.log(`     API Status: ${data.status}`);
      console.log(`     AI Service: ${data.aiService}`);

      if (data.aiService !== 'online') {
        console.log(`${colors.yellow}  ⚠️  Warning: AI service is offline (check OPENAI_API_KEY)${colors.reset}`);
        results.warnings++;
      }

      results.passed++;
      results.tests.push({ name: 'Status Check', status: 'PASS', aiService: data.aiService });
      return true;
    } else {
      console.log(`${colors.red}  ❌ Status check failed${colors.reset}`);
      results.failed++;
      results.tests.push({ name: 'Status Check', status: 'FAIL' });
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}  ❌ Status check failed - ${error.message}${colors.reset}`);
    results.failed++;
    results.tests.push({ name: 'Status Check', status: 'FAIL', error: error.message });
    return false;
  }
}

async function testAITextEndpoint() {
  console.log(`\n${colors.cyan}[3/7] Testing AI Text Endpoint...${colors.reset}`);

  try {
    const { status, data } = await makeRequest('/api/v1/ai/text-command1', {
      method: 'POST',
      body: {
        message: 'Hello, are you working?',
        userId: 'verify-test',
      },
    });

    if (status === 200 && data.message) {
      console.log(`${colors.green}  ✅ AI text endpoint working${colors.reset}`);
      console.log(`     AI Response: "${data.message.substring(0, 100)}..."`);
      console.log(`     Conversation ID: ${data.conversationId}`);
      results.passed++;
      results.tests.push({ name: 'AI Text Endpoint', status: 'PASS' });
      return true;
    } else {
      console.log(`${colors.red}  ❌ AI text endpoint failed${colors.reset}`);
      console.log(`     Response:`, data);
      results.failed++;
      results.tests.push({ name: 'AI Text Endpoint', status: 'FAIL' });
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}  ❌ AI text endpoint failed - ${error.message}${colors.reset}`);
    results.failed++;
    results.tests.push({ name: 'AI Text Endpoint', status: 'FAIL', error: error.message });
    return false;
  }
}

async function testCalendarIntegration() {
  console.log(`\n${colors.cyan}[4/7] Testing Calendar Integration...${colors.reset}`);

  try {
    const { status, data } = await makeRequest('/api/v1/ai/text-command1', {
      method: 'POST',
      body: {
        message: 'What meetings do I have today?',
        userId: 'verify-test',
      },
    });

    if (status === 200 && data.toolCalls) {
      const calendarCall = data.toolCalls.find(t => t.tool === 'check_calendar');

      if (calendarCall) {
        if (calendarCall.result.success) {
          console.log(`${colors.green}  ✅ Calendar integration working${colors.reset}`);
          console.log(`     Events found: ${calendarCall.result.count || 0}`);
          results.passed++;
          results.tests.push({ name: 'Calendar Integration', status: 'PASS' });
        } else {
          console.log(`${colors.yellow}  ⚠️  Calendar API not configured${colors.reset}`);
          console.log(`     Error: ${calendarCall.result.error || 'Not initialized'}`);
          results.warnings++;
          results.tests.push({ name: 'Calendar Integration', status: 'WARN', note: 'Not configured' });
        }
      } else {
        console.log(`${colors.yellow}  ⚠️  AI didn't call calendar function${colors.reset}`);
        results.warnings++;
        results.tests.push({ name: 'Calendar Integration', status: 'WARN', note: 'Function not called' });
      }
      return true;
    } else {
      console.log(`${colors.red}  ❌ Calendar test failed${colors.reset}`);
      results.failed++;
      results.tests.push({ name: 'Calendar Integration', status: 'FAIL' });
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}  ❌ Calendar test failed - ${error.message}${colors.reset}`);
    results.failed++;
    results.tests.push({ name: 'Calendar Integration', status: 'FAIL', error: error.message });
    return false;
  }
}

async function testEmailIntegration() {
  console.log(`\n${colors.cyan}[5/7] Testing Email Integration...${colors.reset}`);

  try {
    const { status, data } = await makeRequest('/api/v1/ai/text-command1', {
      method: 'POST',
      body: {
        message: 'Draft an email to test@example.com saying hello',
        userId: 'verify-test',
      },
    });

    if (status === 200 && data.toolCalls) {
      const emailCall = data.toolCalls.find(t => t.tool === 'send_email');

      if (emailCall) {
        if (emailCall.result.success) {
          console.log(`${colors.green}  ✅ Email integration working${colors.reset}`);
          console.log(`     Draft created: ${emailCall.result.draftId ? 'Yes' : 'No'}`);
          results.passed++;
          results.tests.push({ name: 'Email Integration', status: 'PASS' });
        } else {
          console.log(`${colors.yellow}  ⚠️  Email API not configured${colors.reset}`);
          console.log(`     Error: ${emailCall.result.error || 'Not initialized'}`);
          results.warnings++;
          results.tests.push({ name: 'Email Integration', status: 'WARN', note: 'Not configured' });
        }
      } else {
        console.log(`${colors.yellow}  ⚠️  AI didn't call email function${colors.reset}`);
        results.warnings++;
        results.tests.push({ name: 'Email Integration', status: 'WARN', note: 'Function not called' });
      }
      return true;
    } else {
      console.log(`${colors.red}  ❌ Email test failed${colors.reset}`);
      results.failed++;
      results.tests.push({ name: 'Email Integration', status: 'FAIL' });
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}  ❌ Email test failed - ${error.message}${colors.reset}`);
    results.failed++;
    results.tests.push({ name: 'Email Integration', status: 'FAIL', error: error.message });
    return false;
  }
}

async function testDatabase() {
  console.log(`\n${colors.cyan}[6/7] Testing Database Connection...${colors.reset}`);

  try {
    const { status, data } = await makeRequest('/api/v1/ai/conversations/verify-test');

    if (status === 200 && data.conversationId) {
      console.log(`${colors.green}  ✅ Database connection working${colors.reset}`);
      console.log(`     Stored messages: ${data.messageCount || 0}`);
      results.passed++;
      results.tests.push({ name: 'Database Connection', status: 'PASS' });
      return true;
    } else {
      console.log(`${colors.red}  ❌ Database test failed${colors.reset}`);
      results.failed++;
      results.tests.push({ name: 'Database Connection', status: 'FAIL' });
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}  ❌ Database test failed - ${error.message}${colors.reset}`);
    results.failed++;
    results.tests.push({ name: 'Database Connection', status: 'FAIL', error: error.message });
    return false;
  }
}

async function testFunctionCalling() {
  console.log(`\n${colors.cyan}[7/7] Testing Function Calling...${colors.reset}`);

  try {
    const { status, data } = await makeRequest('/api/v1/ai/text-command1', {
      method: 'POST',
      body: {
        message: 'What is 15% of $2,500?',
        userId: 'verify-test',
      },
    });

    if (status === 200 && data.toolCalls) {
      console.log(`${colors.green}  ✅ Function calling working${colors.reset}`);
      console.log(`     Tools called: ${data.toolCalls.map(t => t.tool).join(', ')}`);
      results.passed++;
      results.tests.push({ name: 'Function Calling', status: 'PASS' });
      return true;
    } else if (status === 200) {
      console.log(`${colors.yellow}  ⚠️  AI responded without function calls${colors.reset}`);
      console.log(`     (This is okay - AI decided function wasn't needed)`);
      results.passed++;
      results.tests.push({ name: 'Function Calling', status: 'PASS', note: 'No function needed' });
      return true;
    } else {
      console.log(`${colors.red}  ❌ Function calling test failed${colors.reset}`);
      results.failed++;
      results.tests.push({ name: 'Function Calling', status: 'FAIL' });
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}  ❌ Function calling test failed - ${error.message}${colors.reset}`);
    results.failed++;
    results.tests.push({ name: 'Function Calling', status: 'FAIL', error: error.message });
    return false;
  }
}

// Run all tests
async function runTests() {
  await testHealth();
  await testStatus();
  await testAITextEndpoint();
  await testCalendarIntegration();
  await testEmailIntegration();
  await testDatabase();
  await testFunctionCalling();

  // Print summary
  console.log(`\n${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════╗
║                    Test Summary                          ║
╚══════════════════════════════════════════════════════════╝
${colors.reset}`);

  console.log(`\n${colors.green}✅ Passed: ${results.passed}${colors.reset}`);
  console.log(`${colors.red}❌ Failed: ${results.failed}${colors.reset}`);
  console.log(`${colors.yellow}⚠️  Warnings: ${results.warnings}${colors.reset}`);

  // Overall status
  console.log('\n' + colors.bright);
  if (results.failed === 0 && results.warnings === 0) {
    console.log(`${colors.green}
╔══════════════════════════════════════════════════════════╗
║  🎉 All tests passed! Your deployment is fully working!  ║
╚══════════════════════════════════════════════════════════╝
${colors.reset}`);
  } else if (results.failed === 0) {
    console.log(`${colors.yellow}
╔══════════════════════════════════════════════════════════╗
║  ✅ Core functionality working!                          ║
║  ⚠️  Some integrations not configured (see warnings)     ║
╚══════════════════════════════════════════════════════════╝
${colors.reset}`);
    console.log(`\n${colors.yellow}Note: Calendar and Email warnings are expected if you haven't${colors.reset}`);
    console.log(`${colors.yellow}set up Microsoft 365 credentials yet. See MICROSOFT_SETUP_GUIDE.md${colors.reset}\n`);
  } else {
    console.log(`${colors.red}
╔══════════════════════════════════════════════════════════╗
║  ❌ Some tests failed. Please check the errors above.    ║
╚══════════════════════════════════════════════════════════╝
${colors.reset}`);
    console.log(`\n${colors.yellow}Common fixes:${colors.reset}`);
    console.log(`  1. Verify all environment variables are set in Railway`);
    console.log(`  2. Check Railway deployment logs for errors`);
    console.log(`  3. Ensure PostgreSQL database is running`);
    console.log(`  4. Verify OPENAI_API_KEY is valid`);
    console.log(`\nSee DEPLOYMENT_VERIFICATION.md for detailed troubleshooting.\n`);
  }

  // Exit code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(error => {
  console.error(`\n${colors.red}Fatal error: ${error.message}${colors.reset}\n`);
  process.exit(1);
});
