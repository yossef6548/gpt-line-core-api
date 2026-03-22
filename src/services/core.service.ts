import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ulid } from 'ulid';
import { AccountEntity } from '../entities/account.entity';
import { PackageEntity } from '../entities/package.entity';
import { CallSessionEntity } from '../entities/call-session.entity';
import { BridgeCommandEntity } from '../entities/bridge-command.entity';
import { BalanceLedgerEntity } from '../entities/balance-ledger.entity';
import { PurchaseCreditEntity } from '../entities/purchase-credit.entity';
import { AdminAuditLogEntity } from '../entities/admin-audit-log.entity';
import { RedisService } from '../redis/redis.service';
import { billedSeconds, formatHebrewBalance, validatePhoneE164 } from '../common/validators';
import type { CallEndedReason, DenyPrompt } from '../common/enums';

@Injectable()
export class CoreService {
  constructor(
    private readonly ds: DataSource,
    private readonly redis: RedisService,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(PackageEntity) private readonly packages: Repository<PackageEntity>,
    @InjectRepository(CallSessionEntity) private readonly calls: Repository<CallSessionEntity>,
    @InjectRepository(BridgeCommandEntity) private readonly commands: Repository<BridgeCommandEntity>,
    @InjectRepository(BalanceLedgerEntity) private readonly ledger: Repository<BalanceLedgerEntity>,
    @InjectRepository(PurchaseCreditEntity) private readonly credits: Repository<PurchaseCreditEntity>,
    @InjectRepository(AdminAuditLogEntity) private readonly audits: Repository<AdminAuditLogEntity>,
  ) {}

  async ensureCaller(phone: string): Promise<AccountEntity> {
    if (!validatePhoneE164(phone)) throw new BadRequestException('Invalid phone_e164');
    let account = await this.accounts.findOneBy({ phone_e164: phone });
    if (!account) {
      account = this.accounts.create({ phone_e164: phone, remaining_seconds: 0, status: 'active' });
      await this.accounts.save(account);
    }
    return account;
  }

  async balance(phone: string): Promise<{ phone_e164: string; remaining_seconds: number; speakable_hebrew_text: string }> {
    const account = await this.ensureCaller(phone);
    return {
      phone_e164: account.phone_e164,
      remaining_seconds: account.remaining_seconds,
      speakable_hebrew_text: formatHebrewBalance(account.remaining_seconds),
    };
  }

  async preflight(input: { phone_e164: string; provider_call_id: string; asterisk_uniqueid: string; started_at: string }): Promise<any> {
    let lockAcquired = false;
    let lockOwner = '';
    try {
      const account = await this.ensureCaller(input.phone_e164);
      const callSessionId = `call_${ulid()}`;
      lockOwner = callSessionId;
      const denied = await this.preflightDenyReason(account, callSessionId);
      if (denied) return { allowed: false, deny_prompt: denied };
      lockAcquired = true;

      const startedAt = new Date(input.started_at);
      const cutoff = new Date(Date.now() + account.remaining_seconds * 1000);
      await this.calls.save(
        this.calls.create({
          call_session_id: callSessionId,
          phone_e164: input.phone_e164,
          provider_call_id: input.provider_call_id,
          asterisk_uniqueid: input.asterisk_uniqueid,
          state: 'preflighted',
          started_at: startedAt,
          connected_at: null,
          ended_at: null,
          absolute_cutoff_at: cutoff,
          warning_at_seconds: 60,
          ended_reason: null,
          billed_seconds: null,
          preflight_remaining_seconds: account.remaining_seconds,
          bridge_ended_at: null,
          bridge_ended_reason: null,
        }),
      );
      return {
        allowed: true,
        remaining_seconds: account.remaining_seconds,
        warning_at_seconds: 60,
        absolute_cutoff_epoch_ms: cutoff.getTime(),
        call_session_id: callSessionId,
      };
    } catch (error) {
      if (lockAcquired && lockOwner) {
        await this.redis.releaseActiveCallIfOwner(input.phone_e164, lockOwner);
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      return { allowed: false, deny_prompt: 'system_error' as DenyPrompt };
    }
  }

  private async preflightDenyReason(account: AccountEntity, lockOwner: string): Promise<DenyPrompt | null> {
    if (account.status === 'blocked') return 'account_blocked';
    if (account.status === 'fraud_review') return 'account_under_review';
    if (account.remaining_seconds < 1) return 'no_minutes';

    const acquired = await this.redis.acquireActiveCall(account.phone_e164, lockOwner);
    if (acquired) return null;

    const active = await this.calls.exist({ where: { phone_e164: account.phone_e164, state: 'preflighted' } });
    const connected = await this.calls.exist({ where: { phone_e164: account.phone_e164, state: 'connected' } });
    const warning = await this.calls.exist({ where: { phone_e164: account.phone_e164, state: 'warning_sent' } });
    if (active || connected || warning) return 'active_call_exists';

    await this.redis.releaseActiveCall(account.phone_e164);
    return (await this.redis.acquireActiveCall(account.phone_e164, lockOwner)) ? null : 'active_call_exists';
  }

  async pollCommand(callSessionId: string): Promise<any> {
    const command = await this.commands.findOne({ where: { call_session_id: callSessionId, is_acknowledged: false }, order: { created_at: 'ASC' } });
    if (!command) return { call_session_id: callSessionId, pending_command: null };
    return {
      call_session_id: callSessionId,
      pending_command: { command: command.command, reason: command.reason, created_at: command.created_at.toISOString() },
    };
  }

  async ackCommand(callSessionId: string, commandType: string, executedAt: string): Promise<{ ok: boolean }> {
    const command = await this.commands.findOne({ where: { call_session_id: callSessionId, command: commandType as any, is_acknowledged: false } });
    if (command) {
      command.is_acknowledged = true;
      command.acknowledged_at = new Date(executedAt);
      await this.commands.save(command);
    }
    return { ok: true };
  }

  async endCall(payload: { call_session_id: string; phone_e164: string; ended_reason: CallEndedReason; ended_at: string }): Promise<any> {
    const session = await this.calls.findOneBy({ call_session_id: payload.call_session_id });
    if (!session) throw new NotFoundException('call_session not found');
    if (session.phone_e164 !== payload.phone_e164) throw new BadRequestException('phone_e164 does not match call_session');

    if (session.state === 'ended') {
      const account = await this.accounts.findOneByOrFail({ phone_e164: session.phone_e164 });
      await this.redis.releaseActiveCallIfOwner(session.phone_e164, session.call_session_id);
      return { ok: true, billed_seconds: session.billed_seconds ?? 0, remaining_seconds: account.remaining_seconds };
    }

    const endedAt = new Date(payload.ended_at);
    if (endedAt.getTime() < session.started_at.getTime()) {
      throw new BadRequestException('ended_at must be >= started_at');
    }

    const rawBilled = billedSeconds(session.connected_at, endedAt);
    const billed = Math.min(rawBilled, session.preflight_remaining_seconds);

    const remaining = await this.ds.transaction(async (trx) => {
      session.state = 'ended';
      session.ended_reason = payload.ended_reason;
      session.ended_at = endedAt;
      session.billed_seconds = billed;
      await trx.getRepository(CallSessionEntity).save(session);

      const account = await trx.getRepository(AccountEntity).findOneByOrFail({ phone_e164: session.phone_e164 });
      account.remaining_seconds = Math.max(0, account.remaining_seconds - billed);
      await trx.getRepository(AccountEntity).save(account);
      await trx.getRepository(BalanceLedgerEntity).save(
        trx.getRepository(BalanceLedgerEntity).create({
          phone_e164: session.phone_e164,
          entry_type: 'call_debit',
          delta_seconds: -billed,
          reference_type: 'call_session',
          reference_id: session.call_session_id,
          metadata_json: { ended_reason: payload.ended_reason },
        }),
      );
      return account.remaining_seconds;
    });

    await this.redis.releaseActiveCallIfOwner(session.phone_e164, session.call_session_id);
    return { ok: true, billed_seconds: billed, remaining_seconds: remaining };
  }

  async bridgeConnected(callSessionId: string, connectedAt: string): Promise<{ ok: boolean }> {
    const session = await this.calls.findOneBy({ call_session_id: callSessionId });
    if (session && session.state !== 'ended') {
      session.state = 'connected';
      session.connected_at = new Date(connectedAt);
      await this.calls.save(session);
    }
    return { ok: true };
  }

  async bridgeWarningDue(callSessionId: string): Promise<{ ok: boolean }> {
    const session = await this.calls.findOneBy({ call_session_id: callSessionId });
    if (!session || session.state === 'ended') return { ok: true };
    const exists = await this.commands.exists({ where: { call_session_id: callSessionId, command: 'play_warning' } });
    if (!exists) {
      await this.commands.save(this.commands.create({ call_session_id: callSessionId, command: 'play_warning', reason: 'time_threshold' }));
    }
    if (session.state !== 'warning_sent') {
      session.state = 'warning_sent';
      await this.calls.save(session);
    }
    return { ok: true };
  }

  async createForceEnd(callSessionId: string, reason: string): Promise<void> {
    const session = await this.calls.findOneBy({ call_session_id: callSessionId });
    if (!session || session.state === 'ended') return;
    const pending = await this.commands.exists({ where: { call_session_id: callSessionId, command: 'force_end', is_acknowledged: false } });
    if (!pending) {
      await this.commands.save(this.commands.create({ call_session_id: callSessionId, command: 'force_end', reason }));
    }
  }

  async bridgeCutoffDue(callSessionId: string): Promise<{ ok: boolean }> {
    await this.createForceEnd(callSessionId, 'time_expired');
    return { ok: true };
  }

  async bridgeEnded(payload: { call_session_id: string; phone_e164: string; ended_at: string; reason: CallEndedReason }): Promise<{ ok: boolean }> {
    const session = await this.calls.findOneBy({ call_session_id: payload.call_session_id });
    if (!session || session.phone_e164 !== payload.phone_e164) return { ok: true };

    if (!session.bridge_ended_at) {
      session.bridge_ended_at = new Date(payload.ended_at);
    }
    if (!session.bridge_ended_reason) {
      session.bridge_ended_reason = payload.reason;
    }
    await this.calls.save(session);
    return { ok: true };
  }

  async paymentCredit(input: {
    payment_txn_id: string; phone_e164: string; package_code: string; amount_agorot: number; granted_seconds: number; provider_name: string; provider_status: string;
  }): Promise<{ ok: boolean; phone_e164: string; remaining_seconds: number }> {
    const account = await this.ensureCaller(input.phone_e164);
    if (account.status !== 'active') throw new BadRequestException('account status disallows credits');
    const existing = await this.credits.findOneBy({ payment_txn_id: input.payment_txn_id });
    if (existing) {
      const current = await this.accounts.findOneByOrFail({ phone_e164: input.phone_e164 });
      return { ok: true, phone_e164: input.phone_e164, remaining_seconds: current.remaining_seconds };
    }

    const remaining = await this.ds.transaction(async (trx) => {
      await trx.getRepository(PurchaseCreditEntity).save(trx.getRepository(PurchaseCreditEntity).create(input));
      const acct = await trx.getRepository(AccountEntity).findOneByOrFail({ phone_e164: input.phone_e164 });
      acct.remaining_seconds += input.granted_seconds;
      await trx.getRepository(AccountEntity).save(acct);
      await trx.getRepository(BalanceLedgerEntity).save(trx.getRepository(BalanceLedgerEntity).create({
        phone_e164: input.phone_e164,
        entry_type: 'purchase_credit',
        delta_seconds: input.granted_seconds,
        reference_type: 'payment_txn',
        reference_id: input.payment_txn_id,
        metadata_json: { package_code: input.package_code, amount_agorot: input.amount_agorot },
      }));
      return acct.remaining_seconds;
    });
    return { ok: true, phone_e164: input.phone_e164, remaining_seconds: remaining };
  }

  async packageCatalog(): Promise<{ packages: PackageEntity[] }> {
    return { packages: await this.packages.find({ where: { active: true }, order: { display_order: 'ASC' } }) };
  }

  async adminSummary(): Promise<any> {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [activeCallCount, activeAccountCount, blockedAccountCount, recentPurchaseCount, recentFailedPurchaseCount] = await Promise.all([
      this.calls.count({ where: [{ state: 'preflighted' }, { state: 'connected' }, { state: 'warning_sent' }] as any }),
      this.accounts.count({ where: { status: 'active' } }),
      this.accounts.count({ where: { status: 'blocked' } }),
      this.credits.createQueryBuilder('pc').where('pc.provider_status = :status', { status: 'approved' }).andWhere('pc.created_at >= :since', { since }).getCount(),
      this.credits.createQueryBuilder('pc').where('pc.provider_status != :status', { status: 'approved' }).andWhere('pc.created_at >= :since', { since }).getCount(),
    ]);
    return {
      active_call_count: activeCallCount,
      active_account_count: activeAccountCount,
      blocked_account_count: blockedAccountCount,
      recent_purchase_count_24h: recentPurchaseCount,
      recent_failed_purchase_count_24h: recentFailedPurchaseCount,
    };
  }

  async adminSetStatus(phone: string, status: 'active' | 'blocked', identity: string, reason?: string): Promise<{ ok: boolean }> {
    const acc = await this.ensureCaller(phone);
    const before = { ...acc };
    acc.status = status;
    await this.accounts.save(acc);
    await this.audits.save(this.audits.create({
      admin_identity: identity,
      action_type: status === 'blocked' ? 'block_account' : 'unblock_account',
      target_phone_e164: phone,
      before_json: before,
      after_json: { ...acc, reason },
    }));
    return { ok: true };
  }

  async adminAdjust(phone: string, seconds: number, kind: 'credit' | 'debit', identity: string, reason?: string): Promise<{ ok: boolean; remaining_seconds: number }> {
    const remaining = await this.ds.transaction(async (trx) => {
      const acct = await trx.getRepository(AccountEntity).findOneByOrFail({ phone_e164: phone });
      const before = { ...acct };
      const delta = kind === 'credit' ? seconds : -seconds;
      acct.remaining_seconds = Math.max(0, acct.remaining_seconds + delta);
      await trx.getRepository(AccountEntity).save(acct);
      await trx.getRepository(BalanceLedgerEntity).save(trx.getRepository(BalanceLedgerEntity).create({
        phone_e164: phone,
        entry_type: kind === 'credit' ? 'admin_credit' : 'admin_debit',
        delta_seconds: delta,
        reference_type: 'admin',
        reference_id: identity,
        metadata_json: { reason: reason ?? null },
      }));
      await trx.getRepository(AdminAuditLogEntity).save(trx.getRepository(AdminAuditLogEntity).create({
        admin_identity: identity,
        action_type: `admin_${kind}`,
        target_phone_e164: phone,
        before_json: before as any,
        after_json: { ...acct, reason } as any,
      }));
      return acct.remaining_seconds;
    });
    return { ok: true, remaining_seconds: remaining };
  }

  async adminTerminate(callSessionId: string, identity: string, reason?: string): Promise<{ ok: boolean }> {
    const call = await this.calls.findOneBy({ call_session_id: callSessionId });
    await this.createForceEnd(callSessionId, 'backend_revoke');
    await this.audits.save(this.audits.create({
      admin_identity: identity,
      action_type: 'terminate_call',
      target_phone_e164: call?.phone_e164 ?? null,
      before_json: call as any,
      after_json: { call_session_id: callSessionId, reason: reason ?? null },
    }));
    return { ok: true };
  }

  async adminListAccounts(search?: string, status?: string, page = 1): Promise<any> {
    const limit = 50;
    const qb = this.accounts.createQueryBuilder('a')
      .addSelect('(SELECT MAX(cs.started_at) FROM call_sessions cs WHERE cs.phone_e164 = a.phone_e164)', 'last_call_at')
      .addSelect('(SELECT COALESCE(SUM(pc.granted_seconds), 0) FROM purchase_credits pc WHERE pc.phone_e164 = a.phone_e164)', 'lifetime_purchased_seconds')
      .addSelect('(SELECT COALESCE(SUM(cs2.billed_seconds), 0) FROM call_sessions cs2 WHERE cs2.phone_e164 = a.phone_e164 AND cs2.billed_seconds IS NOT NULL)', 'lifetime_consumed_seconds');

    if (search) qb.andWhere('a.phone_e164 ILIKE :search', { search: `%${search}%` });
    if (status) qb.andWhere('a.status = :status', { status });

    qb.orderBy('a.created_at', 'DESC').skip((page - 1) * limit).take(limit);
    const { entities, raw } = await qb.getRawAndEntities();

    return {
      items: entities.map((entity, idx) => ({
        ...entity,
        last_call_at: raw[idx].last_call_at,
        lifetime_purchased_seconds: Number(raw[idx].lifetime_purchased_seconds ?? 0),
        lifetime_consumed_seconds: Number(raw[idx].lifetime_consumed_seconds ?? 0),
      })),
      page,
    };
  }

  async adminGetAccount(phone: string): Promise<any> {
    const account = await this.accounts.findOneByOrFail({ phone_e164: phone });
    const [recentCalls, recentPurchases, recentLedger, aggregates] = await Promise.all([
      this.calls.find({ where: { phone_e164: phone }, order: { created_at: 'DESC' }, take: 20 }),
      this.credits.find({ where: { phone_e164: phone }, order: { created_at: 'DESC' }, take: 20 }),
      this.ledger.find({ where: { phone_e164: phone }, order: { created_at: 'DESC' }, take: 50 }),
      this.calls.createQueryBuilder('c')
        .select('MAX(c.started_at)', 'last_call_at')
        .addSelect('COALESCE(SUM(c.billed_seconds), 0)', 'lifetime_consumed_seconds')
        .where('c.phone_e164 = :phone', { phone })
        .getRawOne(),
    ]);

    const purchased = await this.credits.createQueryBuilder('pc')
      .select('COALESCE(SUM(pc.granted_seconds), 0)', 'lifetime_purchased_seconds')
      .where('pc.phone_e164 = :phone', { phone })
      .getRawOne();

    return {
      account_summary: {
        ...account,
        last_call_at: aggregates.last_call_at,
        lifetime_purchased_seconds: Number(purchased.lifetime_purchased_seconds ?? 0),
        lifetime_consumed_seconds: Number(aggregates.lifetime_consumed_seconds ?? 0),
      },
      recent_calls: recentCalls,
      recent_purchases: recentPurchases,
      recent_ledger_items: recentLedger,
    };
  }

  async adminListCalls(page = 1, phone?: string, state?: string): Promise<any> {
    const qb = this.calls.createQueryBuilder('c');
    if (phone) qb.andWhere('c.phone_e164 = :phone', { phone });
    if (state) qb.andWhere('c.state = :state', { state });
    qb.orderBy('c.created_at', 'DESC').skip((page - 1) * 50).take(50);
    const rows = await qb.getMany();
    return {
      items: rows.map((r) => ({
        ...r,
        estimated_duration_seconds: r.connected_at ? Math.max(0, Math.floor((Date.now() - r.connected_at.getTime()) / 1000)) : 0,
        estimated_remaining_seconds: Math.max(0, r.preflight_remaining_seconds - (r.connected_at ? Math.floor((Date.now() - r.connected_at.getTime()) / 1000) : 0)),
      })),
      page,
    };
  }

  async adminGetCall(callSessionId: string): Promise<any> {
    return this.calls.findOneByOrFail({ call_session_id: callSessionId });
  }
}
