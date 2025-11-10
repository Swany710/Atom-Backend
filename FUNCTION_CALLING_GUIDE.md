# OpenAI Function Calling - Implementation Guide

## Overview

Atom Backend now uses **OpenAI Function Calling** to intelligently route user requests to the appropriate tools. This enables the AI to decide whether to search the knowledge base, check the calendar, send emails, update CRM, or simply answer general questions.

## How It Works

### 1. User Makes a Request
```
User: "What meetings do I have tomorrow?"
```

### 2. AI Analyzes Intent
The AI examines the request and determines which tool(s) to use:
- Recognizes this is a calendar query
- Calls `check_calendar` function with tomorrow's date

### 3. Function Execution
The backend executes the appropriate function:
```typescript
checkCalendar(startDate: '2025-10-23', endDate: '2025-10-23')
```

### 4. AI Responds with Context
The AI receives the function result and formulates a natural response:
```
Assistant: "You have 3 meetings tomorrow:
- 9:00 AM: Team Standup
- 2:00 PM: Client Review
- 4:00 PM: Project Planning"
```

## Available Tools

### 1. `search_knowledge_base`
**Purpose:** Search company documents, project info, notes
**Use When:** User asks about specific projects, documents, or company information
**Status:** 🚧 Stub (needs RAG integration)

**Example:**
```
User: "What was the budget for the Johnson project?"
AI calls: search_knowledge_base(query: "Johnson project budget")
```

**TODO:** Integrate with:
- Pinecone (vector database)
- Weaviate
- ChromaDB
- Or custom RAG solution

---

### 2. `check_calendar`
**Purpose:** View calendar events and availability
**Use When:** User asks about schedule, meetings, or free time
**Status:** 🚧 Stub (needs Calendar API)

**Example:**
```
User: "Am I free at 3pm today?"
AI calls: check_calendar(start_date: "2025-10-22T15:00:00", end_date: "2025-10-22T16:00:00")
```

**TODO:** Integrate with:
- Google Calendar API
- Microsoft Outlook Calendar API

---

### 3. `create_calendar_event`
**Purpose:** Schedule new meetings/events
**Use When:** User wants to create an appointment
**Status:** 🚧 Stub (needs Calendar API)

**Example:**
```
User: "Schedule a meeting with John tomorrow at 2pm"
AI calls: create_calendar_event(
  title: "Meeting with John",
  start_time: "2025-10-23T14:00:00",
  end_time: "2025-10-23T15:00:00",
  attendees: ["john@example.com"]
)
```

**TODO:** Integrate with:
- Google Calendar API
- Microsoft Outlook Calendar API

---

### 4. `send_email`
**Purpose:** Draft or send emails
**Use When:** User wants to communicate via email
**Status:** 🚧 Stub (needs Email API)

**Example:**
```
User: "Send an email to Sarah thanking her for the meeting"
AI calls: send_email(
  to: ["sarah@example.com"],
  subject: "Thank You for Today's Meeting",
  body: "Hi Sarah, thank you for taking the time...",
  draft_only: false
)
```

**TODO:** Integrate with:
- Gmail API
- Microsoft Outlook API

---

### 5. `update_crm`
**Purpose:** Update customer relationship management system
**Use When:** User wants to log interactions, update customer info
**Status:** 🚧 Stub (needs CRM integration)

**Example:**
```
User: "Log that I called the ABC Corp client today"
AI calls: update_crm(
  customer_id: "abc-corp",
  action: "log_interaction",
  data: {
    type: "phone_call",
    date: "2025-10-22",
    notes: "Follow-up call regarding project status"
  }
)
```

**TODO:** Integrate with:
- Salesforce
- HubSpot
- Custom CRM systems

---

### 6. `get_general_info`
**Purpose:** Answer general questions without external tools
**Use When:** User asks general knowledge questions
**Status:** ✅ Working

**Example:**
```
User: "What's 15% of $2,500?"
AI calls: get_general_info(query: "Calculate 15% of $2,500")
AI responds: "$375"
```

## Testing the Implementation

### 1. Test with Text Command
```bash
curl -X POST http://localhost:3000/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What meetings do I have today?",
    "userId": "test-user-123"
  }'
```

**Expected Response:**
```json
{
  "message": "Calendar integration not yet implemented, but I would check your calendar for today's events.",
  "conversationId": "test-user-123",
  "timestamp": "2025-10-22T...",
  "mode": "openai",
  "toolCalls": [
    {
      "tool": "check_calendar",
      "args": {
        "start_date": "2025-10-22",
        "end_date": "2025-10-22"
      },
      "result": {
        "events": [],
        "message": "Calendar integration not yet implemented..."
      }
    }
  ]
}
```

### 2. Test with Voice Command
```bash
curl -X POST http://localhost:3000/api/v1/ai/voice-command1 \
  -F "audio=@test-audio.mp3" \
  -F "userId=test-user-123"
```

## Architecture Details

### Service Structure
```
AIVoiceService
├── systemPrompt (getter)          - Defines AI's role and capabilities
├── getToolDefinitions()           - Returns array of function schemas
├── runChatWithTools()             - Main orchestrator
│   ├── Fetches conversation history
│   ├── Calls OpenAI with tools
│   ├── Executes tool calls
│   └── Returns final response
├── executeFunctionCall()          - Routes to specific tool
└── Tool implementations
    ├── searchKnowledgeBase()
    ├── checkCalendar()
    ├── createCalendarEvent()
    ├── sendEmail()
    ├── updateCRM()
    └── getGeneralInfo()
```

### Message Flow
```
1. User message arrives
2. Load last 10 messages from DB (conversation context)
3. Add system prompt + history + new message
4. Call OpenAI with tools parameter
5. If AI requests tool(s):
   a. Execute each tool function
   b. Collect results
   c. Send results back to OpenAI
   d. Get final AI response
6. Save user message + assistant response to DB
7. Return response to user (with tool metadata)
```

### Code Location
- **Main Service:** `src/ai/ai-voice.service.ts`
- **Tool Definitions:** Lines 90-246
- **Orchestrator:** Lines 251-338
- **Function Router:** Lines 343-371
- **Tool Stubs:** Lines 376-452

## Implementing a Tool

### Example: Implementing `checkCalendar`

**Step 1: Install Google Calendar API**
```bash
npm install googleapis @google-cloud/local-auth
```

**Step 2: Set up authentication**
```typescript
import { google } from 'googleapis';

// In constructor or separate method
private async initGoogleCalendar() {
  const auth = new google.auth.GoogleAuth({
    keyFile: './google-credentials.json',
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  this.calendar = google.calendar({ version: 'v3', auth });
}
```

**Step 3: Replace stub implementation**
```typescript
private async checkCalendar(
  startDate: string,
  endDate?: string,
  searchQuery?: string,
  sessionId?: string,
): Promise<any> {
  this.logger.log(`Checking calendar: ${startDate} to ${endDate}`);

  try {
    const response = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate || startDate).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      q: searchQuery,
    });

    const events = response.data.items || [];

    return {
      success: true,
      events: events.map(event => ({
        title: event.summary,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        attendees: event.attendees?.map(a => a.email),
        location: event.location,
      })),
      count: events.length,
    };
  } catch (error) {
    this.logger.error('Calendar API error:', error);
    return {
      success: false,
      error: 'Failed to fetch calendar events',
    };
  }
}
```

**Step 4: Add environment variables**
```env
GOOGLE_CALENDAR_CREDENTIALS=./google-credentials.json
```

**Step 5: Test**
```bash
curl -X POST http://localhost:3000/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{"message": "What meetings do I have today?", "userId": "user-123"}'
```

## Next Steps

### Immediate Priorities
1. ✅ Function calling framework (DONE)
2. 🚧 Implement RAG knowledge base
3. 🚧 Add calendar integration
4. 🚧 Add email integration
5. 🚧 Add authentication (critical!)

### Security Considerations
Before implementing any integrations:
- **Add user authentication** (JWT, OAuth 2.0)
- **Verify user permissions** for each tool call
- **Add rate limiting** to prevent abuse
- **Sanitize all inputs** before calling external APIs
- **Encrypt sensitive data** (tokens, credentials)
- **Audit log all actions** (who did what, when)

### Performance Optimizations
- Cache calendar events for quick lookups
- Use Redis for conversation context caching
- Implement async tool execution for parallel calls
- Add retry logic for external API failures
- Monitor OpenAI token usage and costs

## Debugging

### Enable Detailed Logging
The service already logs:
- Tool calls requested by AI
- Tool execution with arguments
- Results returned

Check logs for:
```
[AIVoiceService] AI requested 1 tool call(s)
[AIVoiceService] Executing tool: check_calendar { start_date: '2025-10-22' }
[AIVoiceService] [STUB] Checking calendar: 2025-10-22 to undefined
```

### Inspect Tool Metadata
The response includes `toolCalls` array showing exactly what the AI requested:
```json
{
  "toolCalls": [
    {
      "tool": "check_calendar",
      "args": { "start_date": "2025-10-22" },
      "result": { "events": [], "message": "..." }
    }
  ]
}
```

## Resources

- [OpenAI Function Calling Docs](https://platform.openai.com/docs/guides/function-calling)
- [Google Calendar API](https://developers.google.com/calendar/api)
- [Gmail API](https://developers.google.com/gmail/api)
- [Microsoft Graph API](https://docs.microsoft.com/en-us/graph/overview)
- [Pinecone (Vector DB)](https://www.pinecone.io/)
- [LangChain (RAG framework)](https://js.langchain.com/)

## Questions?

Function calling is a powerful architecture that enables your AI assistant to:
- Make intelligent decisions about which tools to use
- Execute multiple operations in sequence
- Combine data from different sources
- Provide contextual, personalized responses

The current implementation provides the foundation - now it's ready for you to connect real services!
