# Testing Guide - Calendar & Email Integration

## Quick Start

After setting up Google credentials (see `GOOGLE_SETUP_GUIDE.md`), test the AI assistant's new capabilities.

---

## 1. Calendar Features

### Test: Check Calendar

**Natural Language Request:**
```bash
curl -X POST http://localhost:3000/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What meetings do I have today?",
    "userId": "test-user"
  }'
```

**Expected AI Behavior:**
- AI recognizes calendar query
- Calls `check_calendar` function with today's date
- Returns formatted list of meetings

**Alternative Questions:**
- "Am I free at 3pm tomorrow?"
- "What's on my calendar this week?"
- "Do I have any meetings with John?"
- "Show me my schedule for Friday"

---

### Test: Create Calendar Event

**Natural Language Request:**
```bash
curl -X POST http://localhost:3000/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Schedule a meeting with Sarah tomorrow at 2pm for 1 hour to discuss the project",
    "userId": "test-user"
  }'
```

**Expected AI Behavior:**
- AI extracts: title, date/time, duration, attendees
- Calls `create_calendar_event` with parsed parameters
- Creates event with Google Meet link
- Confirms creation to user

**Alternative Requests:**
- "Book a dentist appointment next Tuesday at 10am"
- "Set up a team standup every Monday at 9am" *(future: recurring events)*
- "Add a reminder to call Mom on her birthday"

---

## 2. Email Features

### Test: Send Email

**Natural Language Request:**
```bash
curl -X POST http://localhost:3000/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Send an email to john@example.com thanking him for the meeting and asking about next steps",
    "userId": "test-user"
  }'
```

**Expected AI Behavior:**
- AI extracts recipient and intent
- Composes professional email
- Calls `send_email` function
- Confirms email sent

**Response Example:**
```
Subject: Thank You for the Meeting
Body: Hi John,

Thank you for taking the time to meet today. I appreciate your insights on the project.

I wanted to follow up and ask about the next steps. What would be the best way to proceed?

Looking forward to hearing from you.

Best regards
```

---

### Test: Draft Email (Don't Send)

**Natural Language Request:**
```bash
curl -X POST http://localhost:3000/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Draft an email to the team updating them on project status, but dont send it yet",
    "userId": "test-user"
  }'
```

**Expected AI Behavior:**
- AI recognizes "draft" keyword
- Calls `send_email` with `draft_only: true`
- Creates Gmail draft (doesn't send)
- Confirms draft created

---

### Test: Read Emails *(Future Feature)*

Currently, the AI doesn't proactively call `read_emails`, but you can add it to the function definitions.

**Potential Request:**
- "What are my unread emails?"
- "Did I get any emails from Sarah today?"
- "Summarize my inbox"

---

## 3. Combined Workflows

### Test: Email + Calendar

**Natural Language Request:**
```bash
curl -X POST http://localhost:3000/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Schedule a meeting with Mike next Tuesday at 3pm and send him an email to confirm",
    "userId": "test-user"
  }'
```

**Expected AI Behavior:**
- Creates calendar event
- Sends confirmation email to Mike
- Returns both results

---

## 4. Voice Command Testing

### Test: Voice Calendar Check

```bash
curl -X POST http://localhost:3000/api/v1/ai/voice-command1 \
  -F "audio=@recording.mp3" \
  -F "userId=test-user"
```

**Audio File Content:**
"What's on my calendar today?"

**Expected Response:**
- Transcription: "What's on my calendar today?"
- AI checks calendar
- Returns list of events

---

## 5. Debugging Tips

### Enable Detailed Logging

Check backend logs for:

```
[AIVoiceService] AI requested 1 tool call(s)
[AIVoiceService] Executing tool: check_calendar { start_date: '2025-10-22' }
[CalendarService] Checking calendar from 2025-10-22 to 2025-10-23
[CalendarService] Found 3 calendar events
```

### Inspect Tool Metadata

The API response includes `toolCalls`:

```json
{
  "message": "You have 3 meetings today: ...",
  "conversationId": "test-user",
  "toolCalls": [
    {
      "tool": "check_calendar",
      "args": {
        "start_date": "2025-10-22"
      },
      "result": {
        "success": true,
        "events": [...],
        "count": 3
      }
    }
  ]
}
```

---

## 6. Error Testing

### Test: No Credentials

**Setup:**
```bash
# Remove credentials from .env temporarily
```

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What meetings do I have?",
    "userId": "test-user"
  }'
```

**Expected Response:**
```json
{
  "message": "I'm unable to access your calendar at the moment. The Calendar API is not initialized. Please configure Google credentials.",
  "toolCalls": [
    {
      "tool": "check_calendar",
      "result": {
        "success": false,
        "error": "Calendar API not initialized. Please configure Google credentials."
      }
    }
  ]
}
```

---

### Test: Invalid Date

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Schedule a meeting yesterday at 5pm",
    "userId": "test-user"
  }'
```

**Expected:**
- AI may recognize invalid date
- Creates event in the past (Google allows)
- OR AI clarifies: "Did you mean tomorrow?"

---

## 7. Performance Testing

### Test: Multiple Tool Calls

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Check my calendar for tomorrow, and if I have no meetings at 2pm, schedule a call with Alex and send him an email",
    "userId": "test-user"
  }'
```

**Expected Behavior:**
1. Calls `check_calendar` (tomorrow's events)
2. Analyzes results
3. Calls `create_calendar_event` (if 2pm is free)
4. Calls `send_email` (to Alex)
5. Returns summary of all actions

**Check:**
- All 3 tools should appear in `toolCalls` array
- Operations should execute sequentially
- AI should provide coherent summary

---

## 8. Edge Cases

### Test: Ambiguous Request

**Request:**
"Schedule a meeting with Sarah"

**Expected:**
- AI asks for clarification: "When would you like to meet with Sarah?"
- Or makes assumption: "Tomorrow at 10am?"

---

### Test: No Results

**Request:**
"What meetings do I have on December 25th?"

**Expected:**
```json
{
  "message": "You don't have any meetings scheduled for December 25th.",
  "toolCalls": [
    {
      "tool": "check_calendar",
      "result": {
        "success": true,
        "events": [],
        "count": 0,
        "message": "No events found for the specified time period"
      }
    }
  ]
}
```

---

## 9. Conversation Memory Testing

### Test: Multi-Turn Context

**Turn 1:**
```bash
curl -X POST http://localhost:3000/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What meetings do I have tomorrow?",
    "userId": "test-user",
    "conversationId": "session-123"
  }'
```

**Turn 2 (Same Session):**
```bash
curl -X POST http://localhost:3000/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Cancel the 2pm one",
    "userId": "test-user",
    "conversationId": "session-123"
  }'
```

**Expected:**
- AI remembers previous calendar query
- Knows which event "the 2pm one" refers to
- Calls delete function with correct event ID

---

## 10. Production Readiness Checklist

Before deploying to production:

### Security
- [ ] Add user authentication (JWT)
- [ ] Implement per-user credential storage
- [ ] Verify user owns sessionId before tool execution
- [ ] Add rate limiting
- [ ] Encrypt refresh tokens in database

### Error Handling
- [ ] Add retry logic for API failures
- [ ] Graceful fallback when APIs are down
- [ ] User-friendly error messages

### Features
- [ ] Add read emails functionality
- [ ] Support recurring calendar events
- [ ] Add email attachments support
- [ ] Implement email search/filtering

### Testing
- [ ] Write unit tests for services
- [ ] Add integration tests for OAuth flow
- [ ] Test multi-user scenarios
- [ ] Load testing for concurrent requests

### Monitoring
- [ ] Log all API calls (audit trail)
- [ ] Monitor API quotas (Gmail/Calendar limits)
- [ ] Track token usage and costs (OpenAI)
- [ ] Set up alerts for errors

---

## Useful Commands

### Check Logs
```bash
npm run start:dev
# Watch for initialization messages
```

### Test OAuth Flow
```bash
node get-google-token.js
```

### Verify Credentials
```bash
curl http://localhost:3000/api/v1/ai/status
```

---

## Troubleshooting

### "Calendar API not initialized"
→ Check `.env` has `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`

### AI doesn't call the right tool
→ Check function definitions in `ai-voice.service.ts`
→ Make request more explicit: "Use my calendar to..."

### Email sent but no confirmation
→ Check Gmail sent folder
→ Check logs for API errors

---

## Next Steps

1. ✅ Follow `GOOGLE_SETUP_GUIDE.md` to get credentials
2. ✅ Test calendar features
3. ✅ Test email features
4. ✅ Test combined workflows
5. 🚧 Add user authentication
6. 🚧 Implement RAG knowledge base
7. 🚧 Add CRM integration

Happy testing! 🚀
