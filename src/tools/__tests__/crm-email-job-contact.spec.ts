/**
 * crm_email_job_contact — guard tests.
 *
 * This tool puts mail in a homeowner's inbox and writes to a CRM job file, so
 * the failure paths matter more than the happy path. Specifically:
 *
 *   - never write "email sent" on a job file when the send actually failed
 *   - never send at all when we can't resolve a real recipient
 *   - a saved draft is not correspondence and must not be logged
 *   - sent-but-not-logged is a REAL outcome and must be reported as such,
 *     because the homeowner has the email and the job file does not show it
 *
 * AccuLynx cannot send mail (no send-mail endpoint exists in their v2 API), so
 * delivery always goes through the user's own mailbox and the job entry is a
 * record of it. These tests pin that split.
 */

import { ToolExecutionService } from '../tool-execution.service';

// ── Mock builders ───────────────────────────────────────────────────────────

function makeDeps(over: Record<string, any> = {}) {
  const sent: any[] = [];
  const logged: any[] = [];

  const accuLynx = {
    getJobPrimaryContact: jest.fn().mockResolvedValue({
      success: true,
      data: { contactId: 'c1', name: 'Jane Homeowner', emails: ['jane@example.com'], phones: [] },
    }),
    logEmailOnJob: jest.fn().mockImplementation(async (jobId: string, email: any) => {
      logged.push({ jobId, ...email });
      return { success: true, message: 'Note added successfully' };
    }),
    ...(over.accuLynx ?? {}),
  };

  const emailService = {
    sendEmail: jest.fn().mockImplementation(async (to: string[], subject: string, body: string) => {
      sent.push({ to, subject, body });
      return { success: true, id: 'msg-1' };
    }),
    ...(over.emailService ?? {}),
  };

  const crmPolicy = {
    checkJobAccess: jest.fn().mockResolvedValue(null),   // null = allowed
    ...(over.crmPolicy ?? {}),
  };

  const noop = new Proxy({}, { get: () => jest.fn() });

  const svc = new ToolExecutionService(
    noop as any,            // gmailService
    noop as any,            // calendarService
    noop as any,            // googleCalendar
    accuLynx as any,        // accuLynx
    crmPolicy as any,       // crmPolicy
    noop as any,            // knowledgeBase
    noop as any,            // notes
    { isWriteTool: () => true } as any,   // toolDefs
    noop as any,            // pendingActions
    { log: jest.fn() } as any,            // audit
    noop as any,            // scheduledTasks
    emailService as any,    // emailService (EMAIL_PROVIDER)
    noop as any,            // emailRouter
    noop as any,            // outlookTransport
    noop as any,            // outlookCalendar
  );

  // Resolve which mailbox the router would pick — default gmail.
  (svc as any).userEmailProvider = jest.fn().mockResolvedValue('gmail');

  // Call dispatchWrite directly: that's the post-confirmation body. Going
  // through execute() would drag in the whole pending-action round trip, which
  // has its own spec — these tests are about what the tool does once the user
  // has already said yes.
  const run = (args: Record<string, unknown>) =>
    (svc as any).dispatchWrite('crm_email_job_contact', args, 'user-1', 'session-1');

  return { svc, run, accuLynx, emailService, crmPolicy, sent, logged };
}

const baseArgs = { jobId: 'job-1', subject: 'Roof install Thursday', body: 'Crew arrives 7am.' };

// ── Tests ───────────────────────────────────────────────────────────────────

describe('crm_email_job_contact', () => {

  describe('recipient resolution', () => {

    it("looks up the job's primary contact when no recipient is given", async () => {
      const { run, accuLynx, sent } = makeDeps();

      const res: any = await run({ ...baseArgs });

      expect(accuLynx.getJobPrimaryContact).toHaveBeenCalledWith('job-1');
      expect(sent[0].to).toEqual(['jane@example.com']);
      expect(res.success).toBe(true);
      expect(res.contactName).toBe('Jane Homeowner');
    });

    it('uses an explicit recipient without touching the CRM lookup', async () => {
      const { run, accuLynx, sent } = makeDeps();

      await run({ ...baseArgs, to: ['someone.else@example.com'] });

      expect(accuLynx.getJobPrimaryContact).not.toHaveBeenCalled();
      expect(sent[0].to).toEqual(['someone.else@example.com']);
    });

    it('sends NOTHING when the contact has no email on file', async () => {
      const { run, emailService, accuLynx } = makeDeps({
        accuLynx: {
          getJobPrimaryContact: jest.fn().mockResolvedValue({
            success: true,
            data: { contactId: 'c1', name: 'Jane Homeowner', emails: [], phones: [] },
          }),
        },
      });

      const res: any = await run({ ...baseArgs });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/no email address on file/i);
      expect(emailService.sendEmail).not.toHaveBeenCalled();
      expect(accuLynx.logEmailOnJob).not.toHaveBeenCalled();
    });

    it('sends NOTHING when the CRM lookup itself fails', async () => {
      const { run, emailService } = makeDeps({
        accuLynx: {
          getJobPrimaryContact: jest.fn().mockResolvedValue({ success: false, error: 'job not found' }),
        },
      });

      const res: any = await run({ ...baseArgs });

      expect(res.success).toBe(false);
      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('never claim more than actually happened', () => {

    it('does NOT write to the job file when the send failed', async () => {
      const { run, accuLynx } = makeDeps({
        emailService: {
          sendEmail: jest.fn().mockResolvedValue({ success: false, error: 'mailbox not connected' }),
        },
      });

      const res: any = await run({ ...baseArgs });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/was NOT sent/i);
      expect(accuLynx.logEmailOnJob).not.toHaveBeenCalled();
    });

    it('does NOT log a draft — a draft is not correspondence', async () => {
      const { run, accuLynx } = makeDeps();

      const res: any = await run({ ...baseArgs, draftOnly: true });

      expect(res.success).toBe(true);
      expect(res.drafted).toBe(true);
      expect(res.jobLogged).toBe(false);
      expect(accuLynx.logEmailOnJob).not.toHaveBeenCalled();
    });

    it('reports sent-but-not-logged honestly instead of swallowing it', async () => {
      const { run, sent } = makeDeps({
        accuLynx: {
          logEmailOnJob: jest.fn().mockResolvedValue({ success: false, error: 'CRM 500' }),
        },
      });

      const res: any = await run({ ...baseArgs });

      // The homeowner really did get the email — so this is a success…
      expect(res.success).toBe(true);
      expect(sent).toHaveLength(1);
      // …but the job file does not show it, and the message must say so.
      expect(res.jobLogged).toBe(false);
      expect(res.jobLogError).toBe('CRM 500');
      expect(res.message).toMatch(/could NOT be recorded on the job file/i);
    });

    it('marks jobLogged true only when the CRM write actually succeeded', async () => {
      const { run, logged } = makeDeps();

      const res: any = await run({ ...baseArgs });

      expect(res.jobLogged).toBe(true);
      expect(logged).toHaveLength(1);
      expect(logged[0].jobId).toBe('job-1');
      expect(logged[0].subject).toBe('Roof install Thursday');
    });

    it('honours skipJobLog without pretending it was logged', async () => {
      const { run, accuLynx } = makeDeps();

      const res: any = await run({ ...baseArgs, skipJobLog: true });

      expect(res.success).toBe(true);
      expect(res.jobLogged).toBe(false);
      expect(accuLynx.logEmailOnJob).not.toHaveBeenCalled();
    });
  });

  describe('CRM access policy', () => {

    it('refuses when the user is not allowed to touch the job', async () => {
      const denial = { success: false, error: 'You are not assigned to this job.' };
      const { run, emailService, accuLynx } = makeDeps({
        crmPolicy: { checkJobAccess: jest.fn().mockResolvedValue(denial) },
      });

      const res: any = await run({ ...baseArgs });

      expect(res).toEqual(denial);
      expect(emailService.sendEmail).not.toHaveBeenCalled();
      expect(accuLynx.getJobPrimaryContact).not.toHaveBeenCalled();
    });
  });
});
