# Deployment Verification Checklist

Quick guide to verify your Atom AI Assistant is running correctly on Railway.

---

## 🎯 Quick Verification (2 minutes)

### Step 1: Check Railway Dashboard

1. Go to https://railway.app/dashboard
2. Open your project
3. Verify both services are showing:
   - ✅ **Backend** - Green/Running
   - ✅ **Database (PostgreSQL)** - Green/Running

**If RED:** Click on service → **Deployments** → Check error logs

---

### Step 2: Check Backend Health

```bash
# Replace with your actual Railway URL
export BACKEND_URL="https://your-app.up.railway.app"

# Test health endpoint
curl $BACKEND_URL/api/v1/ai/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "service": "Atom Backend API",
  "timestamp": "2025-10-22T..."
}
```

❌ **If it fails:** Backend is not running. Check Step 3.

---

### Step 3: Check Backend Status

```bash
curl $BACKEND_URL/api/v1/ai/status
```

**Expected Response:**
```json
{
  "status": "available",
  "aiService": "online",
  "timestamp": "2025-10-22T..."
}
```

✅ **If aiService is "online":** OpenAI API key is configured correctly
❌ **If aiService is "offline":** OpenAI API key is missing or invalid

---

## 🔍 Detailed Backend Verification

### 1. Check Environment Variables

In Railway → Your Backend Service → **Variables**

**Required Variables (Must All Be Set):**
```
✅ DATABASE_URL          (auto-set by Railway)
✅ OPENAI_API_KEY        (starts with sk-)
✅ MICROSOFT_TENANT_ID   (UUID format)
✅ MICROSOFT_CLIENT_ID   (UUID format)
✅ MICROSOFT_CLIENT_SECRET
✅ MICROSOFT_USER_EMAIL  (your email)
```

**Optional:**
```
✅ NODE_ENV=production
✅ PORT (auto-set by Railway, don't set manually)
```

---

### 2. Check Backend Logs

In Railway → Your Backend Service → **Deployments** → Latest deployment

**Look for these SUCCESS messages:**
```
✅ Atom App Module loaded - Ready for frontend connection
✅ Microsoft Graph API (Calendar) initialized successfully
✅ Microsoft Graph API (Outlook) initialized successfully
✅ 🚀 Atom Backend running on port 3000
```

**Common ERROR messages:**

❌ **"Microsoft Calendar credentials not configured"**
→ Missing: `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, or `MICROSOFT_CLIENT_SECRET`

❌ **"OPENAI_API_KEY not found"**
→ Missing or invalid OpenAI API key

❌ **"Connection to database failed"**
→ DATABASE_URL not set (add PostgreSQL service)

---

### 3. Test AI Text Endpoint

```bash
curl -X POST $BACKEND_URL/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, can you hear me?",
    "userId": "test-user"
  }'
```

**Expected Response:**
```json
{
  "message": "Yes, I can hear you! I'm Atom, your AI assistant...",
  "conversationId": "test-user",
  "timestamp": "2025-10-22T...",
  "mode": "openai"
}
```

✅ **Success:** OpenAI integration working
❌ **Error:** Check OpenAI API key and logs

---

### 4. Test Calendar Integration

```bash
curl -X POST $BACKEND_URL/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What meetings do I have today?",
    "userId": "test-user"
  }'
```

**Expected Response (if calendar configured):**
```json
{
  "message": "You have 2 meetings today: ...",
  "conversationId": "test-user",
  "toolCalls": [
    {
      "tool": "check_calendar",
      "args": { "start_date": "2025-10-22" },
      "result": { "success": true, "count": 2, ... }
    }
  ]
}
```

**If calendar NOT configured:**
```json
{
  "message": "I'm unable to access your calendar...",
  "toolCalls": [
    {
      "tool": "check_calendar",
      "result": {
        "success": false,
        "error": "Calendar API not initialized..."
      }
    }
  ]
}
```

---

### 5. Test Email Integration

```bash
curl -X POST $BACKEND_URL/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Draft an email to myself saying test",
    "userId": "test-user"
  }'
```

**Expected Response (if email configured):**
```json
{
  "message": "I've created a draft email...",
  "toolCalls": [
    {
      "tool": "send_email",
      "result": { "success": true, "draftId": "..." }
    }
  ]
}
```

---

### 6. Test Database Connection

```bash
curl -X GET $BACKEND_URL/api/v1/ai/conversations/test-user
```

**Expected Response:**
```json
{
  "conversationId": "test-user",
  "messages": [...],
  "messageCount": 3
}
```

✅ **Success:** Database connection working
❌ **500 Error:** Database connection failed

---

## 🌐 Frontend Verification

### 1. Check Frontend Deployment

In Railway → Your Frontend Service

**Status should be:**
- ✅ Green/Running
- ✅ Domain generated
- ✅ Deployment successful

---

### 2. Visit Frontend URL

```bash
# Open in browser
open https://your-frontend.up.railway.app
```

**Check for:**
- ✅ Page loads (not 404)
- ✅ No console errors (F12 → Console)
- ✅ Can see chat interface

---

### 3. Test Frontend → Backend Connection

In your frontend browser console (F12):

```javascript
// Test if frontend can reach backend
fetch('https://your-backend.up.railway.app/api/v1/ai/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

**Expected:**
```json
{ "status": "healthy", "service": "Atom Backend API", ... }
```

**If CORS error:**
```
Access to fetch has been blocked by CORS policy
```
→ Backend needs CORS configuration for your frontend domain

---

### 4. Test Full User Flow

1. **Open frontend**
2. **Type message:** "What meetings do I have today?"
3. **Send message**

**Expected:**
- ✅ Message appears in chat
- ✅ Loading indicator shows
- ✅ AI response appears
- ✅ No errors in console

**If it fails:**
- Check browser console for errors
- Check Network tab (F12 → Network)
- Verify backend URL in frontend env vars

---

## 🔧 Common Issues & Fixes

### Issue 1: Backend Shows "Crashed" or "Failed"

**Check:**
1. Railway → Backend → Deployments → Build Logs
2. Look for error during build

**Common causes:**
- Missing dependencies in package.json
- TypeScript compilation errors
- Build script failed

**Fix:**
```bash
# Locally test build
npm run build

# If successful, push to trigger redeploy
git push origin main
```

---

### Issue 2: Backend Starts Then Crashes

**Check:**
1. Railway → Backend → Deployments → Deploy Logs
2. Look for error on startup

**Common causes:**
- Missing DATABASE_URL
- Invalid environment variables
- Port binding issues

**Fix:**
1. Verify PostgreSQL service exists
2. Check all required env vars are set
3. Restart service

---

### Issue 3: "Calendar API not initialized"

**Symptoms:**
- Logs show: "Microsoft Calendar credentials not configured"
- Calendar queries fail

**Fix:**
1. Verify Azure AD app is created
2. Check these env vars are set:
   ```
   MICROSOFT_TENANT_ID
   MICROSOFT_CLIENT_ID
   MICROSOFT_CLIENT_SECRET
   MICROSOFT_USER_EMAIL
   ```
3. Verify admin consent granted in Azure
4. Restart backend service

---

### Issue 4: Frontend Can't Connect to Backend

**Symptoms:**
- Network errors in browser console
- CORS errors
- Request timeouts

**Check:**
1. Frontend has correct backend URL
2. Backend CORS allows frontend domain

**Fix - Update CORS in backend:**

Edit `src/main.ts`:
```typescript
app.enableCors({
  origin: [
    'https://your-frontend.up.railway.app',
    'http://localhost:3000', // for local dev
  ],
  credentials: true,
});
```

Commit and push to redeploy.

---

### Issue 5: OpenAI Errors

**Symptoms:**
- "Invalid API key"
- "Insufficient quota"
- AI responses fail

**Fix:**
1. Verify OPENAI_API_KEY is valid
2. Check API key at https://platform.openai.com/api-keys
3. Verify you have credits: https://platform.openai.com/account/usage
4. Update env var if needed
5. Restart service

---

### Issue 6: Database Connection Failed

**Symptoms:**
- "Connection to database failed"
- 500 errors on API calls
- Can't save conversations

**Fix:**
1. Verify PostgreSQL service exists in Railway
2. Check DATABASE_URL is auto-set
3. Restart PostgreSQL service
4. Restart backend service
5. Check PostgreSQL logs for issues

---

## 📊 Monitoring Checklist

### Daily Checks (During Testing)

- [ ] Check Railway usage (Account → Usage)
- [ ] Review backend logs for errors
- [ ] Test one endpoint to verify it's working
- [ ] Check remaining OpenAI credits

### Weekly Checks

- [ ] Review total costs
- [ ] Check for any failed deployments
- [ ] Verify all services are running
- [ ] Test full user flow (frontend → backend)

---

## 🚨 Emergency Recovery

### If Everything is Down

1. **Check Railway Status**
   - Visit https://status.railway.app
   - Check for platform-wide issues

2. **Check Your Credit**
   - Account → Usage
   - Verify you have credits remaining
   - Add payment method if needed

3. **Restart All Services**
   - Backend → Settings → Restart
   - PostgreSQL → Settings → Restart
   - Frontend → Settings → Restart

4. **Check Recent Changes**
   - Review last git commits
   - Rollback if needed (Deployments → Previous → Redeploy)

---

## ✅ Verification Complete Checklist

### Backend ✅
- [ ] Health endpoint returns "healthy"
- [ ] Status endpoint returns "available"
- [ ] OpenAI integration working (aiService: "online")
- [ ] Microsoft Calendar initialized (check logs)
- [ ] Microsoft Outlook initialized (check logs)
- [ ] Database connection working
- [ ] Can send text messages to AI
- [ ] AI responds with intelligent answers
- [ ] Function calling works (toolCalls in response)

### Frontend ✅
- [ ] Frontend loads in browser
- [ ] No console errors
- [ ] Can type and send messages
- [ ] AI responses appear
- [ ] Loading states work
- [ ] Can access backend API

### Integration ✅
- [ ] Frontend successfully calls backend
- [ ] CORS configured correctly
- [ ] Conversation history saves
- [ ] Calendar queries work
- [ ] Email operations work

---

## 🎯 Success Criteria

**Your deployment is HEALTHY if:**

✅ All services show Green/Running
✅ Health endpoint responds
✅ AI responds to text messages
✅ Frontend can reach backend
✅ No errors in logs
✅ Database stores conversations
✅ OpenAI integration working

**Your deployment is FULLY FUNCTIONAL if:**

✅ All above PLUS:
✅ Calendar integration working
✅ Email integration working
✅ Function calling working
✅ Multi-turn conversations work
✅ Voice commands work (if implemented in frontend)

---

## 📞 Getting Help

If you're still having issues:

1. **Check this guide** for your specific error
2. **Review logs** in Railway (most issues show in logs)
3. **Test locally** - Does it work on your machine?
4. **Railway Discord** - https://discord.gg/railway
5. **GitHub Issues** - Create issue with logs and error details

---

## 🎉 All Green?

If everything above is ✅, congratulations! Your Atom AI Assistant is fully deployed and working!

**Next steps:**
- Start testing with real use cases
- Monitor costs and usage
- Implement authentication (critical!)
- Add more features
- Scale as needed

**Happy testing! 🚀**
