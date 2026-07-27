import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { ConversationMemoryService } from '../conversations/conversation-memory.service';
import { ToolDefinitionsService } from '../tools/tool-definitions.service';
import { ToolExecutionService } from '../tools/tool-execution.service';
import { providerAI } from '../utils/provider-call';

export interface ChatResult {
  response: string;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  newMessages: MessageParam[];
}

/**
 * ClaudeOrchestratorService
 *
 * Two execution modes:
 *   runChat()    - standard request/response (text endpoint, tests)
 *   streamChat() - streaming final turn (voice fast path, parallel TTS)
 */
@Injectable()
export class ClaudeOrchestratorService {
  private readonly anthropic: Anthropic;
  private readonly logger = new Logger(ClaudeOrchestratorService.name);

  // Configurable via CLAUDE_MODEL env var so model upgrades don't require a
  // code change + redeploy — just update the variable and restart.
  static readonly MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

  constructor(
    private readonly config: ConfigService,
    private readonly memory: ConversationMemoryService,
    private readonly toolDefs: ToolDefinitionsService,
    private readonly toolExecution: ToolExecutionService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  // -- System prompt -------------------------------------------------------

  // ── PROMPT CACHING ────────────────────────────────────────────────────────
  // The static prompt (~3.8k tokens) + tool definitions (~7.1k tokens) are
  // ~11k tokens of identical preamble on EVERY call — and a single user turn
  // makes one call per tool-loop iteration. Both are cached so we pay for that
  // block once per ~5-minute window instead of once per request.
  //
  // RULE: nothing that varies per request or per day may live in the static
  // half, or the cache prefix changes and every hit becomes a miss. The date
  // and the active pending action therefore live in the dynamic tail below.

  /** Per-request tail: today's date + any active pending action. NOT cached. */
  private dynamicPrompt(activePending?: { id: string; summary: string } | null): string {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const pendingBlock = activePending
      ? `\n\nACTIVE PENDING ACTION (awaiting confirmation right now):\n  pendingActionId: ${activePending.id}\n  summary: ${activePending.summary}\nIf the user says yes/confirm/proceed/sure/go ahead, call the same tool again with this pendingActionId immediately.`
      : '';

    return `CURRENT DATE: Today is ${today}. All times are Central Time (CT) unless the user says otherwise. Use this date for every relative time ("tomorrow at 9am", "Friday at 3pm", "next Monday").${pendingBlock}`;
  }

  /**
   * System prompt blocks for the Messages API: a cached static block followed
   * by the per-request tail.
   */
  buildSystemBlocks(
    activePending?: { id: string; summary: string } | null,
  ): Anthropic.TextBlockParam[] {
    return [
      {
        type: 'text',
        text: ClaudeOrchestratorService.STATIC_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
      { type: 'text', text: this.dynamicPrompt(activePending) },
    ];
  }

  /**
   * Flat-string system prompt (static + tail). Kept for tests and any caller
   * that wants the whole thing as one string; the API path uses
   * buildSystemBlocks() so the static half can be cached.
   */
  buildSystemPrompt(activePending?: { id: string; summary: string } | null): string {
    return `${ClaudeOrchestratorService.STATIC_PROMPT}\n\n${this.dynamicPrompt(activePending)}`;
  }

  /**
   * Tool definitions with a cache breakpoint on the final entry, which caches
   * the whole tools block (tools are sent before the system prompt, so this
   * marker plus the one on the static prompt cache both in one prefix).
   */
  private cachedTools(): any[] {
    const tools = this.toolDefs.getTools() as any[];
    if (!tools.length) return tools;
    return tools.map((t, i) =>
      i === tools.length - 1
        ? { ...t, cache_control: { type: 'ephemeral' as const } }
        : t,
    );
  }

  /** The cacheable half of the system prompt. Must stay byte-identical per deploy. */
  private static readonly STATIC_PROMPT = `You are Atom, an AI personal assistant for a roofing and contracting business. You are proactive, organized, and operate like a world-class executive assistant. Today's date is given at the END of this prompt — always use that date, never guess it. All times are in Central Time (CT) unless the user specifies otherwise.

You have full access to the user's:
  - Gmail - read, search, summarize, reply, send, draft, delete, archive, mark read/unread
  - Google Calendar - view, search, create, edit, delete events
  - AccuLynx CRM - view jobs, contacts, leads; add notes; create full jobs/leads
    (trades, work type, category, lead source - priority is ALWAYS Normal unless the
    user volunteers otherwise, never ask); update the insurance, adjuster, and
    homeowner windows on a job; run a job submission checkup (crm_job_checkup)
  - Company Knowledge Base - manufacturer product spec library (data sheets + installation guides), SOPs, company info, FAQs
  - Personal Notes - save, list, search, delete the user's quick notes. When the user says "note that...", "make a note", "write this down", or "remember for later", call create_note IMMEDIATELY (it saves instantly, no confirmation) and confirm afterward. Deleting a note requires confirmation.

NOTES THAT CONTAIN ACTION ITEMS - ALSO SET A TASK
- After saving a note, check whether it contains something the user needs to DO at
  or by a time (e.g. "note that I need to call the Hendersons tomorrow at 9",
  "note: submit the permit by Friday"). If so, ALSO call schedule_task for that
  action right after create_note - don't wait to be asked.
- Compute the actual date/time from today's date in CT. If the note implies an
  action but gives NO time at all, save the note and ask ONE short question:
  "Want me to set a reminder for this? When?"
- Tell the user both things you did: "Note saved, and I set a reminder for
  Friday 9:00 AM CT."
  - Scheduled Tasks - schedule future actions (e.g. send a reminder email at a specific date/time), list scheduled tasks, cancel tasks
  - General reasoning - summarize, prioritize, plan, answer questions

HOW TO BEHAVE AS A PERSONAL ASSISTANT
- Be proactive and thorough. When asked to "check my email", pull 10-20 emails and give a smart summary.
- When asked to "prioritize my day", check BOTH calendar and email, then give a clear, ordered action plan.
- When summarizing, always include: sender, subject, key ask, and urgency level.
- When searching email, use smart Gmail query syntax (from:, subject:, is:unread, after:, etc.).
- For calendar, always default to Central Time (CT) for all event times.
- Chain tools together. e.g. "What's on my plate?" --> check calendar + read emails + summarize everything.
- If the user says something vague, interpret it helpfully and do the most useful thing.
- When scheduling tasks: always confirm the scheduled date/time back to the user in Central Time (CT) so they can verify it's correct.
- For relative times like "tomorrow at 9am", "Friday at 3pm", "next Monday", compute the actual date from the CURRENT DATE given at the end of this prompt, in CT.
- After scheduling, always tell the user: what will be sent/done, and exactly when (day + time CT).

PERSONAL TASK REMINDERS - BE PROACTIVE
- When the user mentions something THEY need to do later (get the reinspection packet
  done, set up calls, collect paperwork, follow up with a homeowner), offer to set a
  reminder - or if they gave a time, set one right away (schedule_task with
  taskType "reminder", args { message }). Reminders are emailed to the user at the
  scheduled time.
- When the user asks "what do I need to do?" or similar, call list_scheduled_tasks
  (pendingOnly) AND list their notes, then give one combined to-do rundown.

PIPELINE REVIEW & DAY/WEEK PLANNING
- When the user asks to plan their day/week, review their pipeline, or "what should I
  focus on", pull ALL of these and combine them into ONE ordered plan:
    1. crm_my_pipeline - their assigned jobs by milestone
    2. calendar - today's (or the week's) events
    3. list_scheduled_tasks (pendingOnly) - reminders coming due
    4. their notes - open action items
- Prioritize like a sales/production manager: fresh Leads need contact fast; Prospects
  need inspections/estimates moving; Approved jobs need scheduling and paperwork;
  Completed jobs need invoicing pushed; Invoiced jobs need collection follow-up.
  Work around existing calendar commitments.
- Present the plan as a short, time-ordered list for the day (or day-by-day for a
  week), each item with WHY it matters. Keep it actionable, not a data dump.
- OFFER to put the plan on their calendar: create_calendar_event works as a reminder
  block (e.g. "9:00 Call new leads", "1:00 Henderson reinspection paperwork"). If they
  say yes, create the events (each needs confirmation) with sensible times in CT.
- Calendar reminders vs emailed reminders: if the user wants a reminder "on my
  calendar", use create_calendar_event; if they just want to be reminded, use
  schedule_task type "reminder". When unclear, ask which they prefer - once - and
  remember their answer for the session.

UPDATING A JOB FILE - WHICH TOOL OWNS WHICH TAB
- crm_update_job_details -> Job Details / location tab: job address, work type,
  trade types, job category, lead source, priority.
- crm_update_homeowner   -> Primary Contact tab: name, email, phone, company name,
  the CONTACT's mailing address.
- crm_update_insurance   -> Insurance tab: carrier, claim number, storm date/date of
  loss, date filed, damage location, paperwork.
- crm_update_adjuster    -> Adjuster tab: adjuster name, phone, email, fax, met-with,
  claim approved.
- crm_add_note           -> a note/message on the job.
- Read the current state first with crm_job_checkup (it now returns the location and
  job details too) so you change only what the user asked and can echo back what the
  tab looked like before.
- TRADE TYPES REPLACE, they don't append. If the job is Roofing and the user says "add
  siding", pass ["Roofing","Siding"] - passing just ["Siding"] wipes Roofing.
- The job's LOCATION address (where the work happens) and the CONTACT's mailing address
  are different fields. Ask which one they mean if it's ambiguous.
- Every field is applied on its own, so a result can be partly successful. Report back
  exactly what saved and what did not, and tell the user to set the failures in the
  AccuLynx UI. Never claim a field saved when the result says it didn't.
- Things Atom CANNOT do in AccuLynx (say so plainly, don't pretend): move a job between
  milestones or buckets, and edit or delete an existing worksheet line item.

JOB SUBMISSION HELP
- When the user wants to submit a job or asks if a job is ready, find the job
  (get_crm_jobs) and run crm_job_checkup. Report what's MISSING in plain language and
  offer to fill the gaps one by one using crm_update_insurance / crm_update_adjuster /
  crm_update_homeowner (each needs confirmation).
- Recording claim numbers, dates of loss, and adjuster contact info is factual
  record-keeping and fine; the UPPA guardrail below still applies to anything that
  smells like claim negotiation or coverage advice.

INSURANCE TAB - CAPTURE WHAT THE USER VOLUNTEERS
- Whenever the user mentions claim details in passing - insurance company/carrier,
  claim number, storm date / date of loss, the date the claim was filed, damage
  location, or that paperwork is signed - put them on the job's Insurance tab.
  On a NEW lead pass them straight to crm_create_lead (insuranceCompanyName,
  claimNumber, dateOfLoss, claimFiled, claimFiledDate, damageLocation, hasPaperwork);
  on an EXISTING job use crm_update_insurance. Never leave claim facts sitting only
  in the job note.
- Dates go in as ISO 8601 UTC (e.g. "hail hit June 14th" -> 2026-06-14T00:00:00Z).
  "Storm date" = dateOfLoss. "File date" / "filed it on X" = claimFiledDate.
- INSURANCE COMPANY comes from the account's dropdown, never free text. Atom looks
  the name up automatically. If crm_update_insurance reports the carrier is not in
  the list, call crm_insurance_companies, show the user the close matches, ask which
  one, then retry with that EXACT name. Do NOT tell them to go set it by hand until
  the list confirms the carrier genuinely isn't there.
- Do NOT interrogate the user for these fields the way you don't ask for priority -
  capture what they give you, and only ask if they explicitly want the job filled out
  or a checkup shows them missing.
- Echo back what landed on the Insurance tab after the write so they can verify it.

MOVING A JOB FORWARD (MILESTONES & BUCKETS)
- AccuLynx has NO API to move a job between milestones (Lead -> Prospect) or between the
  buckets/statuses inside a milestone. Atom CANNOT perform the move itself, and you must
  never claim that you did. The move happens in the AccuLynx UI (open the job, use the
  milestone/status control).
- When the user wants to advance a job ("move job X to Prospect", "move it through the
  buckets", "what's next for this job"), call crm_job_advance. It returns the current
  milestone + bucket, the buckets in the current and next milestone, and what is MISSING.
- Then: (1) tell them the current milestone/bucket and the buckets available to move
  through; (2) if anything is missing, offer to fill it now via crm_update_insurance /
  crm_update_adjuster / crm_update_homeowner (each needs confirmation); (3) offer to set a
  reminder (schedule_task type "reminder") to make the move; (4) tell them where to click
  in AccuLynx. Do NOT guide moves into the Approved milestone — stop at Prospect and its buckets.

JOB SUBMISSION - DRIVEN BY THE COMPANY'S OWN SOP
- Each company stores its own submission checklist and workflow SOP in the knowledge base.
  NEVER recite a checklist from memory. Call search_knowledge_base first (e.g. "job
  submission checklist insurance", "submission checklist retail", "supplement checklist",
  "file flow buckets") and follow whatever THAT company's SOP says.
- Pick the right checklist before starting: insurance claim job vs retail job vs a
  supplement (and which supplement type). Use the job's workType to decide, or ask.
- Verify in two passes, and be explicit about which is which:
  1) DATA Atom can read - run crm_job_checkup and report what's missing (homeowner name/
     phone/email, job address, trade types, work type, assigned rep; for insurance also
     insurance company, claim number, date of loss, adjuster, paperwork). Offer to fill
     the gaps with crm_update_insurance / crm_update_adjuster / crm_update_homeowner
     (each needs confirmation).
  2) DOCUMENTS Atom canNOT read - AccuLynx exposes no API to list a job's documents, so
     you cannot verify uploads. Walk the user through the checklist's document items one
     at a time, ask them to confirm each is uploaded AND named per the SOP's convention,
     and track what's still open. NEVER state or imply that a document is present.
- Close out by offering to (a) post a summary on the job with crm_add_note listing what
  was verified and what is still outstanding, and (b) set a reminder (schedule_task type
  "reminder") for anything left open.
- AccuLynx has NO task API, so any "TASK" the checklist requires (e.g. a Sales Enablement
  task on submission) must be created BY THE USER in AccuLynx. Always remind them, and to
  include the applicable trades in the description.
- UPPA: gathering, labeling, and filing claim documents is record-keeping and is fine.
  Do not draft carrier-facing argument, interpret policy language, or advise on approval
  strategy - the guardrail below still applies to supplements and reinspections.

INSURANCE / UPPA COMPLIANCE - LEGAL GUARDRAIL (CRITICAL)
The user is a CONTRACTOR, not a licensed public adjuster. Unlicensed Public Adjusting
(UPPA) laws prohibit contractors from negotiating, adjusting, or advising on insurance
claims on behalf of an insured. You must NEVER:
- Draft or send communications that negotiate a claim, argue coverage, demand a
  supplement's approval, or interpret policy language on a homeowner's behalf.
- Advise a homeowner on what their policy covers, what to say to their insurer, or
  whether to accept/dispute a settlement.
- Present the user or the company as representing the homeowner in the claim.
You MAY: document damage factually, provide manufacturer specs and repair scopes/estimates
for work the contractor performs, schedule inspections, and communicate factual project
information. If a request crosses into claim negotiation or coverage advice, decline that
part, state it may violate UPPA rules for contractors, and suggest the homeowner speak
with their insurer or a licensed public adjuster directly.

PRODUCT QUESTIONS - KNOWLEDGE BASE FIRST (CRITICAL)
- For ANY product-specific question (specs, ratings, materials, warranties, installation steps -
  e.g. GAF, Owens Corning, CertainTeed, IKO, LP SmartSide, James Hardie, Tyvek, EDCO,
  Andersen, Pella, ProVia, Marvin, or any other product), ALWAYS call search_knowledge_base FIRST.
- Answer ONLY from what the knowledge base returns. Quote specs exactly as written in the
  returned documents - NEVER guess, estimate, or fill in numbers from general knowledge.
- Always cite the source: entry title and the manufacturer document URL when present in the content.
- If the search returns nothing relevant (no results, or results that do not actually answer
  the question), tell the user plainly: "That's not in the product spec library." Then ASK
  whether they want you to look elsewhere (general knowledge or other sources). Do NOT answer
  a product question from general knowledge without the user's explicit go-ahead.
- Window specs (U-Factor, SHGC, DP) vary by glass package, size, and frame type - when quoting
  them, remind the user to confirm the exact unit configuration against the cited document.

CONFIRMATION RULE - BACKEND-ENFORCED FOR WRITE ACTIONS
The backend enforces confirmation for write actions. When you call a write tool
WITHOUT pendingActionId, the backend returns:
  { requiresConfirmation: true, pendingActionId: "<id>", summary: "...", expiresAt: "..." }

When you receive requiresConfirmation:
1. Present the summary to the user clearly: "Here's what I'm about to do: [summary]. Shall I proceed?"
2. When the user confirms, call the SAME tool again with pendingActionId set to the id you received.
3. The backend will execute the action and return the real result.

READ-ONLY tools (search, read, get, check, list) execute immediately - no confirmation needed.

CONFIRMATION DISAMBIGUATION - CRITICAL RULE:
"Yes", "ok", "proceed", "confirm", "go ahead", "do it", "sure", "please", "yep", "yeah" and
similar affirmative words ALWAYS refer to YOUR MOST RECENT question or pending action.
NEVER apply a "yes" to an earlier turn in the conversation history.
Look at your very last message — that is what the user is confirming.
If your last message asked "Shall I delete 20 PetSmart emails?", then "yes" = delete those emails.
If your last message asked about a calendar event, then "yes" = confirm that event.
Do NOT reach back to earlier conversation turns when processing a confirmation.`.trim();

  /** Legacy getter — delegates to buildSystemPrompt() with no active pending. */
  get systemPrompt(): string {
    return this.buildSystemPrompt(null);
  }

  // -- Helper: extract most recent active pending action from history --------

  /**
   * Scan the last 8 messages for the most recent tool_result that contains
   * { requiresConfirmation: true, pendingActionId: "..." }.
   *
   * This lets us inject the active pendingActionId directly into the system
   * prompt so the LLM never has to guess which "yes" belongs to.
   */
  private extractActivePending(
    history: MessageParam[],
  ): { id: string; summary: string } | null {
    const recent = history.slice(-8);
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i];
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        for (const block of msg.content as any[]) {
          if (block.type === 'tool_result' && typeof block.content === 'string') {
            try {
              const parsed = JSON.parse(block.content);
              if (parsed.requiresConfirmation === true && parsed.pendingActionId) {
                return {
                  id:      parsed.pendingActionId as string,
                  summary: (parsed.summary as string) ?? 'pending action',
                };
              }
            } catch { /* skip unparseable blocks */ }
          }
        }
      }
    }
    return null;
  }

  // -- Standard (non-streaming) path --------------------------------------

  async runChat(
    sessionId: string,
    userMessage: string,
    userId: string,
    correlationId?: string,
  ): Promise<ChatResult> {
    const history = await this.memory.loadHistory(sessionId);
    const historyLen = history.length;
    const messages: MessageParam[] = [
      ...history,
      { role: 'user', content: userMessage },
    ];

    // Cache breakpoint on the last tool → the whole ~7k tool block is cached.
    const tools = this.cachedTools();
    const toolCallsExecuted: Array<{ tool: string; args: unknown; result: unknown }> = [];

    const activePending = this.extractActivePending(history);
    // Cached static block + per-request tail (see PROMPT CACHING above).
    const systemMsg = this.buildSystemBlocks(activePending);

    let response = await providerAI(
      () => this.anthropic.messages.create({
        model: ClaudeOrchestratorService.MODEL,
        max_tokens: 1024,
        system: systemMsg,
        messages,
        tools,
      }),
      'anthropic.messages.create',
    );

    let assistantText = '';

    while (response.stop_reason === 'tool_use') {
      const textBlocks = response.content.filter(
        (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
      );
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );

      assistantText = textBlocks.map(b => b.text).join(' ');
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        this.logger.log(`[${correlationId ?? sessionId}] tool_use: ${toolUse.name}`);
        let result: unknown;
        try {
          result = await this.toolExecution.execute(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            userId, sessionId, correlationId,
          );
        } catch (toolErr) {
          const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          this.logger.error(`[${correlationId ?? sessionId}] tool "${toolUse.name}" threw: ${errMsg}`);
          result = { error: errMsg, tool: toolUse.name };
        }
        toolCallsExecuted.push({ tool: toolUse.name, args: toolUse.input, result });
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) });
      }

      messages.push({ role: 'user', content: toolResults });

      response = await providerAI(
        () => this.anthropic.messages.create({
          model: ClaudeOrchestratorService.MODEL,
          max_tokens: 1024,
          system: systemMsg,
          messages,
          tools,
        }),
        'anthropic.messages.create',
      );
    }

    const finalTextBlocks = response.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
    );
    const finalResponse = finalTextBlocks.length > 0
      ? finalTextBlocks.map(b => b.text).join(' ').trim()
      : assistantText.trim() || 'I apologize, I could not generate a response.';

    const newMessages: MessageParam[] = [
      ...messages.slice(historyLen),
      { role: 'assistant', content: finalResponse },
    ];

    return { response: finalResponse, toolCalls: toolCallsExecuted, newMessages };
  }

  // -- Streaming path (CHUNK 13: fast voice pipeline) ---------------------

  /**
   * Streaming version of runChat().
   *
   * Latency improvement vs sequential pipeline:
   *
   *   Before:  [STT 3s] --> [Claude 3s full] --> [TTS 1s]  = 7s total, 7s to first audio
   *   After:   [STT 3s] --> [Claude stream: first sentence ~600ms]
   *                     --> [TTS sentence 1 starts at 600ms, done at 1s]
   *                     --> [TTS sentence 2 starts at 1.2s, done at 1.6s] (parallel)
   *                     --> [Claude finishes at 3s]
   *                     = 6s total, ~3.6s to first audio  (2x faster first audio)
   *
   * Design:
   *   - Tool-use turns use regular .create() (sequential tool execution required)
   *   - Final text turn uses .stream() so tokens arrive incrementally
   *   - Caller (VoiceService.processVoiceCommandFast) detects sentence boundaries
   *     in the yielded chunks and fires parallel TTS calls per sentence
   *   - Falls back to sync response if streaming fails
   */
  async *streamChat(
    sessionId: string,
    userMessage: string,
    userId: string,
    correlationId?: string,
  ): AsyncGenerator<string, ChatResult, unknown> {
    const history = await this.memory.loadHistory(sessionId);
    const historyLen = history.length;
    const messages: MessageParam[] = [
      ...history,
      { role: 'user', content: userMessage },
    ];

    // Cache breakpoint on the last tool → the whole ~7k tool block is cached.
    const tools = this.cachedTools();
    const toolCallsExecuted: Array<{ tool: string; args: unknown; result: unknown }> = [];

    // Phase 1: tool-use loop (non-streaming)
    const activePending = this.extractActivePending(history);
    // Cached static block + per-request tail (see PROMPT CACHING above).
    const systemMsg = this.buildSystemBlocks(activePending);

    let response = await providerAI(
      () => this.anthropic.messages.create({
        model: ClaudeOrchestratorService.MODEL,
        max_tokens: 1024,
        system: systemMsg,
        messages,
        tools,
      }),
      'anthropic.messages.create',
    );

    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );
      messages.push({ role: 'assistant', content: response.content });
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        this.logger.log(`[stream:${correlationId ?? sessionId}] tool_use: ${toolUse.name}`);
        let result: unknown;
        try {
          result = await this.toolExecution.execute(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            userId, sessionId, correlationId,
          );
        } catch (toolErr) {
          const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          this.logger.error(`[stream:${sessionId}] tool "${toolUse.name}" threw: ${errMsg}`);
          result = { error: errMsg, tool: toolUse.name };
        }
        toolCallsExecuted.push({ tool: toolUse.name, args: toolUse.input, result });
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) });
      }

      messages.push({ role: 'user', content: toolResults });

      response = await providerAI(
        () => this.anthropic.messages.create({
          model: ClaudeOrchestratorService.MODEL,
          max_tokens: 1024,
          system: systemMsg,
          messages,
          tools,
        }),
        'anthropic.messages.create',
      );
    }

    // Phase 2: stream the final text response
    let fullText = '';

    try {
      const stream = this.anthropic.messages.stream({
        model: ClaudeOrchestratorService.MODEL,
        max_tokens: 1024,
        system: systemMsg,
        messages,
        tools,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          const chunk = event.delta.text;
          fullText += chunk;
          yield chunk;
        }
      }

      await stream.finalMessage();

    } catch (streamErr) {
      this.logger.warn(
        `[stream:${sessionId}] stream failed, falling back to sync response: ` +
        (streamErr instanceof Error ? streamErr.message : String(streamErr)),
      );
      if (!fullText) {
        const fallback = response.content
          .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
          .map(b => b.text).join(' ').trim();
        fullText = fallback || 'I apologize, I could not generate a response.';
        yield fullText;
      }
    }

    const finalResponse = fullText.trim() || 'I apologize, I could not generate a response.';
    const newMessages: MessageParam[] = [
      ...messages.slice(historyLen),
      { role: 'assistant', content: finalResponse },
    ];

    return { response: finalResponse, toolCalls: toolCallsExecuted, newMessages };
  }
}
