import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThanOrEqual } from 'typeorm';
import { UserMemory, MemoryLayer } from './user-memory.entity';

export interface MemoryContext {
  profile:  UserMemory[];
  episodic: UserMemory[];
  tasks:    UserMemory[];
  /** Formatted string ready to inject into the system prompt */
  promptBlock: string;
}

@Injectable()
export class UserMemoryService {
  private readonly logger = new Logger(UserMemoryService.name);

  constructor(
    @InjectRepository(UserMemory)
    private readonly repo: Repository<UserMemory>,
  ) {}

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Load all active memory for a user and return a formatted context block
   * ready to be injected at the top of the system prompt.
   */
  async loadContext(userId: string): Promise<MemoryContext> {
    const now = new Date();
    const rows = await this.repo.find({
      where: [
        { userId, expiresAt: MoreThanOrEqual(now) },
        { userId, expiresAt: undefined as any },  // null = permanent
      ],
      order: { importance: 'DESC', updatedAt: 'DESC' },
    });

    // Clean up expired rows in the background
    this.pruneExpired(userId).catch(() => {});

    const profile  = rows.filter(r => r.layer === 'profile');
    const episodic = rows.filter(r => r.layer === 'episodic').slice(0, 20);
    const tasks    = rows.filter(r => r.layer === 'task');

    const promptBlock = this.buildPromptBlock(profile, episodic, tasks);

    return { profile, episodic, tasks, promptBlock };
  }

  private buildPromptBlock(
    profile: UserMemory[],
    episodic: UserMemory[],
    tasks: UserMemory[],
  ): string {
    const sections: string[] = [];

    if (profile.length > 0) {
      sections.push(
        '── USER PROFILE ──\n' +
        profile.map(m => `• ${m.key}: ${m.value}`).join('\n'),
      );
    }

    if (tasks.length > 0) {
      sections.push(
        '── ACTIVE TASKS & FOLLOW-UPS ──\n' +
        tasks.map(m => `• [${m.key}] ${m.value}`).join('\n'),
      );
    }

    if (episodic.length > 0) {
      sections.push(
        '── RECENT CONTEXT ──\n' +
        episodic.map(m => `• ${m.value}`).join('\n'),
      );
    }

    return sections.length > 0
      ? `\n\n════ MEMORY CONTEXT ════\n${sections.join('\n\n')}\n════════════════════════`
      : '';
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /** Upsert a profile fact — overwrites if key already exists */
  async setProfile(userId: string, key: string, value: string, importance = 7): Promise<void> {
    await this.upsert(userId, 'profile', key, value, importance, undefined);
  }

  /** Record an episodic memory — keeps N days then expires */
  async addEpisodic(
    userId: string,
    key: string,
    value: string,
    ttlDays = 90,
    importance = 5,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
    await this.upsert(userId, 'episodic', key, value, importance, expiresAt);
  }

  /** Set or update a task / follow-up */
  async setTask(userId: string, key: string, value: string, importance = 6): Promise<void> {
    await this.upsert(userId, 'task', key, value, importance, undefined);
  }

  /** Mark a task as resolved — deletes it */
  async resolveTask(userId: string, key: string): Promise<void> {
    await this.repo.delete({ userId, layer: 'task', key });
    this.logger.log(`Task resolved: [${userId}] ${key}`);
  }

  /** Delete a specific memory by key */
  async forget(userId: string, layer: MemoryLayer, key: string): Promise<void> {
    await this.repo.delete({ userId, layer, key });
  }

  /** Extract and persist memory from an assistant turn.
   *  Called by the orchestrator after each response. */
  async extractFromTurn(
    userId: string,
    userMessage: string,
    assistantResponse: string,
  ): Promise<void> {
    // Simple heuristic extraction — Claude handles the heavy lifting via
    // tool calls; this catches common patterns as a fallback.
    const lower = userMessage.toLowerCase();

    // Timezone mentions
    const tzMatch = userMessage.match(/\b(EST|CST|MST|PST|UTC[+-]\d+)\b/i);
    if (tzMatch) {
      await this.setProfile(userId, 'timezone', tzMatch[1].toUpperCase(), 8);
    }

    // Preference signals
    if (lower.includes('prefer') || lower.includes('always') || lower.includes('never')) {
      await this.addEpisodic(
        userId,
        `pref_${Date.now()}`,
        `User stated preference: "${userMessage.slice(0, 200)}"`,
        60,
        6,
      );
    }
  }

  // ── Maintenance ───────────────────────────────────────────────────────────

  private async upsert(
    userId: string,
    layer: MemoryLayer,
    key: string,
    value: string,
    importance: number,
    expiresAt?: Date,
  ): Promise<void> {
    const existing = await this.repo.findOne({ where: { userId, layer, key } });
    if (existing) {
      await this.repo.update(existing.id, { value, importance, expiresAt, updatedAt: new Date() });
    } else {
      await this.repo.save(
        this.repo.create({ userId, layer, key, value, importance, expiresAt }),
      );
    }
  }

  private async pruneExpired(userId: string): Promise<void> {
    const result = await this.repo.delete({
      userId,
      expiresAt: LessThan(new Date()),
    });
    if ((result.affected ?? 0) > 0) {
      this.logger.debug(`Pruned ${result.affected} expired memories for user ${userId}`);
    }
  }
}
