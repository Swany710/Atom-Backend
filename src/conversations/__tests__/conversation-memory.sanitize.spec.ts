/**
 * ConversationMemoryService.sanitizeHistory() — message-shape contract tests.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Anthropic Messages API rejects a request outright when a user message
 * contains a tool_result block whose tool_use_id has no matching tool_use in an
 * EARLIER assistant message:
 *
 *     400 unexpected tool_use_id found in tool_result blocks
 *
 * loadHistory() reads the NEWEST rows only (HISTORY_LIMIT), so once a session
 * grows past that limit the window can begin in the middle of a tool exchange:
 * the assistant message holding the tool_use falls outside the window while the
 * user message holding its tool_result falls inside it.
 *
 * That 400 used to be "handled" upstream by clearing the whole session and
 * retrying — the user silently lost their entire conversation to a data-shape
 * bug. sanitizeHistory() is what prevents it, so it is worth pinning down.
 */

import { ConversationMemoryService } from '../conversation-memory.service';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

// ── Builders ────────────────────────────────────────────────────────────────

const text = (role: 'user' | 'assistant', s: string): MessageParam =>
  ({ role, content: s });

const toolUse = (...ids: string[]): MessageParam => ({
  role: 'assistant',
  content: ids.map(id => ({ type: 'tool_use', id, name: 'some_tool', input: {} })) as any,
});

const toolResult = (...ids: string[]): MessageParam => ({
  role: 'user',
  content: ids.map(id => ({ type: 'tool_result', tool_use_id: id, content: '{}' })) as any,
});

/**
 * Independent oracle — deliberately NOT the implementation.
 * Encodes the Anthropic rule directly so a bug in sanitizeHistory can't hide
 * behind a matching bug in the assertion.
 */
function isApiValid(msgs: MessageParam[]): boolean {
  const seen = new Set<string>();
  for (const m of msgs) {
    const content: any[] = Array.isArray(m.content) ? m.content : [];
    if (m.role === 'assistant') {
      for (const b of content) if (b.type === 'tool_use') seen.add(b.id);
    } else {
      for (const b of content) {
        if (b.type === 'tool_result' && !seen.has(b.tool_use_id)) return false;
      }
    }
  }

  // Every tool_use must also be answered before the history ends.
  const answered = new Set<string>();
  for (const m of msgs) {
    const content: any[] = Array.isArray(m.content) ? m.content : [];
    if (m.role === 'user') {
      for (const b of content) if (b.type === 'tool_result') answered.add(b.tool_use_id);
    }
  }
  for (const m of msgs) {
    const content: any[] = Array.isArray(m.content) ? m.content : [];
    if (m.role === 'assistant') {
      for (const b of content) if (b.type === 'tool_use' && !answered.has(b.id)) return false;
    }
  }
  return true;
}

// ── Subject ─────────────────────────────────────────────────────────────────

// sanitizeHistory is private; these tests are the contract for it, so reach in
// deliberately rather than exposing it on the public surface.
function makeService(): ConversationMemoryService {
  const repo = {} as any;
  const tenantContext = { get: () => undefined } as any;
  return new ConversationMemoryService(repo, tenantContext);
}

function sanitize(msgs: MessageParam[]): MessageParam[] {
  return (makeService() as any).sanitizeHistory('spec-session', msgs);
}

const hasToolResult = (m?: MessageParam) =>
  !!m && m.role === 'user' && Array.isArray(m.content) &&
  (m.content as any[]).some(b => b.type === 'tool_result');

const hasToolUse = (m?: MessageParam) =>
  !!m && m.role === 'assistant' && Array.isArray(m.content) &&
  (m.content as any[]).some(b => b.type === 'tool_use');

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ConversationMemoryService.sanitizeHistory', () => {

  describe('the history window starting mid-tool-exchange (the 400 bug)', () => {

    it('drops a LEADING tool_result whose tool_use fell outside the window', () => {
      const input: MessageParam[] = [
        toolResult('toolu_ORPHAN'),                       // its tool_use was row 41
        text('assistant', 'Here are your 12 unread emails.'),
        text('user', 'thanks, what about my calendar?'),
        text('assistant', 'You have 3 events today.'),
      ];

      expect(isApiValid(input)).toBe(false);              // precondition

      const out = sanitize(input);

      expect(isApiValid(out)).toBe(true);
      expect(out).toHaveLength(3);
      expect(out[0]).toEqual(text('assistant', 'Here are your 12 unread emails.'));
    });

    it('keeps every later message when the leading orphan is removed', () => {
      // Regression guard: the only previous remedy was wiping the session.
      const input: MessageParam[] = [
        toolResult('toolu_GONE'),
        text('assistant', 'a'), text('user', 'b'), text('assistant', 'c'),
        text('user', 'd'), text('assistant', 'e'),
      ];

      expect(sanitize(input)).toHaveLength(5);
    });

    it('drops a multi-tool message when only SOME ids are in the window', () => {
      const input: MessageParam[] = [
        toolResult('toolu_IN', 'toolu_OUT'),
        text('assistant', 'done'),
      ];
      expect(isApiValid(sanitize(input))).toBe(true);
    });
  });

  describe('well-formed history is left alone', () => {

    it('preserves a complete tool exchange', () => {
      const input: MessageParam[] = [
        text('user', 'check my email'),
        toolUse('toolu_1'),
        toolResult('toolu_1'),
        text('assistant', 'You have 4 unread.'),
      ];

      const out = sanitize(input);

      expect(out).toHaveLength(4);
      expect(isApiValid(out)).toBe(true);
    });

    it('preserves plain text-only history', () => {
      const input: MessageParam[] = [
        text('user', 'hi'), text('assistant', 'hello'),
        text('user', 'bye'), text('assistant', 'see ya'),
      ];
      expect(sanitize(input)).toHaveLength(4);
    });

    it('handles an empty history', () => {
      expect(sanitize([])).toHaveLength(0);
    });
  });

  describe('interrupted turns', () => {

    it('drops a trailing assistant tool_use that never got a result', () => {
      const out = sanitize([text('user', 'send it'), toolUse('toolu_9')]);

      expect(isApiValid(out)).toBe(true);
      expect(out.some(hasToolUse)).toBe(false);
    });

    it('never leaves history ending on an unanswered tool_result', () => {
      const out = sanitize([text('user', 'x'), toolUse('toolu_5'), toolResult('toolu_5')]);
      expect(hasToolResult(out[out.length - 1])).toBe(false);
    });
  });

  describe('randomised soak', () => {

    it('produces an API-valid shape for 3000 arbitrary histories', () => {
      // Deterministic PRNG so a failure is reproducible from the seed.
      let rng = 12345;
      const rand = (n: number) => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) % n;

      for (let iter = 0; iter < 3000; iter++) {
        const msgs: MessageParam[] = [];
        const len = 1 + rand(9);

        for (let i = 0; i < len; i++) {
          switch (rand(4)) {
            case 0:  msgs.push(text('user', `u${i}`)); break;
            case 1:  msgs.push(text('assistant', `a${i}`)); break;
            case 2:  msgs.push(toolUse(`id${rand(4)}`)); break;
            default: msgs.push(toolResult(`id${rand(4)}`)); break;
          }
        }

        const out = sanitize(msgs);
        if (!isApiValid(out)) {
          throw new Error(
            `iteration ${iter} produced an invalid history\n` +
            `  in:  ${JSON.stringify(msgs)}\n` +
            `  out: ${JSON.stringify(out)}`,
          );
        }
      }
    });
  });
});
