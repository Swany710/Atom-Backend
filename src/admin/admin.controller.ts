import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../users/user.entity';
import { PendingAction } from '../pending-actions/pending-action.entity';
import { ChatMemory } from '../conversations/chat-memory.entity';
import { ScheduledTask } from '../scheduled-tasks/scheduled-task.entity';
import { InviteCodesService } from '../auth/invite-codes.service';

/**
 * AdminController — cross-user read-only admin endpoints.
 *
 * Protected by the global ApiKeyGuard — only API_KEY Bearer tokens can reach
 * these endpoints (JWT users cannot; the API key is the admin credential).
 *
 * All endpoints return sanitised data — no password hashes, no raw OAuth tokens.
 */
@ApiTags('Admin')
@ApiBearerAuth('bearer')
@Controller('admin')
export class AdminController {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(PendingAction)
    private readonly pendingActions: Repository<PendingAction>,
    @InjectRepository(ChatMemory)
    private readonly chatMemory: Repository<ChatMemory>,
    @InjectRepository(ScheduledTask)
    private readonly scheduledTasks: Repository<ScheduledTask>,
    private readonly config: ConfigService,
    private readonly inviteCodes: InviteCodesService,
  ) {}

  /** Only allow API-key auth mode — reject JWT users from admin endpoints */
  private requireApiKey(req: any): void {
    if (req.authMode !== 'apikey') {
      throw new UnauthorizedException('Admin endpoints require API-key authentication');
    }
  }

  /**
   * GET /admin/stats
   * Aggregate counts for the dashboard overview.
   */
  @Get('stats')
  @ApiOperation({ summary: 'Aggregate stats for admin overview' })
  async stats(@Req() req: any) {
    this.requireApiKey(req);

    const [
      totalUsers,
      verifiedUsers,
      pendingCount,
      confirmedCount,
      expiredCount,
      cancelledCount,
      totalConversations,
      totalScheduledTasks,
      pendingTaskCount,
    ] = await Promise.all([
      this.users.count(),
      this.users.count({ where: { isVerified: true } }),
      this.pendingActions.count({ where: { status: 'pending' } }),
      this.pendingActions.count({ where: { status: 'confirmed' } }),
      this.pendingActions.count({ where: { status: 'expired' } }),
      this.pendingActions.count({ where: { status: 'cancelled' } }),
      this.chatMemory.count(),
      this.scheduledTasks.count(),
      this.scheduledTasks.count({ where: { status: 'pending' } }),
    ]);

    // Recent 24h activity
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentMessages, recentActions] = await Promise.all([
      this.chatMemory.count({ where: { createdAt: MoreThanOrEqual(since24h) } }),
      this.pendingActions.count({ where: { createdAt: MoreThanOrEqual(since24h) } }),
    ]);

    return {
      users: {
        total: totalUsers,
        verified: verifiedUsers,
        unverified: totalUsers - verifiedUsers,
      },
      pendingActions: {
        pending: pendingCount,
        confirmed: confirmedCount,
        expired: expiredCount,
        cancelled: cancelledCount,
        total: pendingCount + confirmedCount + expiredCount + cancelledCount,
      },
      conversations: {
        totalMessages: totalConversations,
        last24h: recentMessages,
      },
      scheduledTasks: {
        total: totalScheduledTasks,
        pending: pendingTaskCount,
      },
      activityLast24h: {
        messages: recentMessages,
        actions: recentActions,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /admin/users
   * List all users — no password hashes.
   */
  @Get('users')
  @ApiOperation({ summary: 'List all registered users' })
  async listUsers(@Req() req: any) {
    this.requireApiKey(req);

    const userList = await this.users.find({
      order: { createdAt: 'DESC' },
    });

    return {
      users: userList.map(u => ({
        id:          u.id,
        email:       u.email,
        displayName: u.displayName ?? null,
        isVerified:  u.isVerified,
        createdAt:   u.createdAt,
        updatedAt:   u.updatedAt,
      })),
      count: userList.length,
    };
  }

  /**
   * GET /admin/pending-actions
   * All pending actions across all users.
   * Query params: status (pending|confirmed|expired|cancelled), userId, limit (default 50)
   */
  @Get('pending-actions')
  @ApiOperation({ summary: 'List pending actions across all users' })
  async listPendingActions(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('limit') limitStr?: string,
  ) {
    this.requireApiKey(req);

    const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 200);

    const where: any = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;

    const actions = await this.pendingActions.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return {
      actions: actions.map(a => ({
        id:            a.id,
        userId:        a.userId,
        toolName:      a.toolName,
        summary:       a.summary,
        status:        a.status,
        sessionId:     a.sessionId ?? null,
        correlationId: a.correlationId ?? null,
        resultSummary: a.resultSummary ?? null,
        createdAt:     a.createdAt,
        expiresAt:     a.expiresAt,
      })),
      count: actions.length,
      filters: { status: status ?? 'all', userId: userId ?? 'all', limit },
    };
  }

  /**
   * GET /admin/activity
   * Recent conversation messages across all sessions — shows what Atom has been doing.
   * Query params: limit (default 50), sessionId
   */
  @Get('activity')
  @ApiOperation({ summary: 'Recent conversation activity across all sessions' })
  async recentActivity(
    @Req() req: any,
    @Query('limit') limitStr?: string,
    @Query('sessionId') sessionId?: string,
  ) {
    this.requireApiKey(req);

    const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 200);
    const where: any = {};
    if (sessionId) where.sessionId = sessionId;

    const messages = await this.chatMemory.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return {
      messages: messages.map(m => ({
        id:        m.id,
        sessionId: m.sessionId,
        role:      m.role,
        // Truncate long messages to 300 chars for the overview
        preview:   m.content.length > 300 ? m.content.slice(0, 300) + '…' : m.content,
        createdAt: m.createdAt,
      })),
      count: messages.length,
    };
  }

  /**
   * GET /admin/invite-codes
   * All invite codes with status and who used them.
   */
  @Get('invite-codes')
  @ApiOperation({ summary: 'List all registration invite codes' })
  async listInviteCodes(@Req() req: any) {
    this.requireApiKey(req);
    const codes = await this.inviteCodes.listAll();
    return {
      codes: codes.map(c => ({
        id:          c.id,
        code:        c.code,
        label:       c.label ?? null,
        status:      c.status,
        usedByEmail: c.usedByEmail ?? null,
        usedAt:      c.usedAt ?? null,
        createdAt:   c.createdAt,
      })),
      count: codes.length,
      masterEnvCodeConfigured: !!process.env.REGISTRATION_INVITE_CODE,
    };
  }

  /**
   * POST /admin/invite-codes  { label? }
   * Create a new single-use invite code.
   */
  @Post('invite-codes')
  @ApiOperation({ summary: 'Create a single-use invite code' })
  async createInviteCode(@Req() req: any, @Body() body: { label?: string }) {
    this.requireApiKey(req);
    const invite = await this.inviteCodes.create(body?.label);
    return {
      success: true,
      code:    invite.code,
      id:      invite.id,
      label:   invite.label ?? null,
    };
  }

  /**
   * POST /admin/invite-codes/:id/revoke
   * Revoke an unused invite code.
   */
  @Post('invite-codes/:id/revoke')
  @ApiOperation({ summary: 'Revoke an unused invite code' })
  async revokeInviteCode(@Req() req: any, @Param('id') id: string) {
    this.requireApiKey(req);
    return this.inviteCodes.revoke(id);
  }

  /**
   * GET /admin/scheduled-tasks
   * All scheduled tasks across all users.
   */
  @Get('scheduled-tasks')
  @ApiOperation({ summary: 'List scheduled tasks across all users' })
  async listScheduledTasks(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('limit') limitStr?: string,
  ) {
    this.requireApiKey(req);

    const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 200);
    const where: any = {};
    if (status) where.status = status;

    const tasks = await this.scheduledTasks.find({
      where,
      order: { scheduledAt: 'DESC' },
      take: limit,
    });

    return {
      tasks: tasks.map(t => ({
        id:            t.id,
        userId:        t.userId,
        taskType:      t.taskType,
        description:   t.description,
        scheduledAt:   t.scheduledAt,
        status:        t.status,
        resultSummary: t.resultSummary ?? null,
        createdAt:     t.createdAt,
      })),
      count: tasks.length,
    };
  }
}
