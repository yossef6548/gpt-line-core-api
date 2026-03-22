import { BadRequestException } from '@nestjs/common';
import { CoreService } from '../../src/services/core.service';

function repoMock() {
  return {
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(async (v) => v),
    create: jest.fn((v) => v),
    exist: jest.fn(),
    exists: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

describe('CoreService', () => {
  let service: CoreService;
  const ds = { transaction: jest.fn() } as any;
  const redis = {
    acquireActiveCall: jest.fn(),
    releaseActiveCall: jest.fn(),
    releaseActiveCallIfOwner: jest.fn(),
  } as any;
  const accounts = repoMock();
  const packages = repoMock();
  const calls = repoMock();
  const commands = repoMock();
  const ledger = repoMock();
  const credits = repoMock();
  const audits = repoMock();

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CoreService(ds, redis, accounts as any, packages as any, calls as any, commands as any, ledger as any, credits as any, audits as any);
  });

  it('preflight allow path', async () => {
    accounts.findOneBy.mockResolvedValue({ phone_e164: '+972501', status: 'active', remaining_seconds: 120 });
    redis.acquireActiveCall.mockResolvedValue(true);
    calls.save.mockResolvedValue(undefined);

    const res = await service.preflight({ phone_e164: '+972501', provider_call_id: 'p', asterisk_uniqueid: 'a', started_at: '2026-01-01T00:00:00Z' });
    expect(res.allowed).toBe(true);
    expect(res.remaining_seconds).toBe(120);
    expect(redis.acquireActiveCall).toHaveBeenCalled();
  });

  it.each([
    ['blocked', 'account_blocked'],
    ['fraud_review', 'account_under_review'],
  ])('preflight deny by status %s', async (status, denyPrompt) => {
    accounts.findOneBy.mockResolvedValue({ phone_e164: '+972501', status, remaining_seconds: 120 });
    const res = await service.preflight({ phone_e164: '+972501', provider_call_id: 'p', asterisk_uniqueid: 'a', started_at: '2026-01-01T00:00:00Z' });
    expect(res).toEqual({ allowed: false, deny_prompt: denyPrompt });
  });

  it('preflight deny no minutes', async () => {
    accounts.findOneBy.mockResolvedValue({ phone_e164: '+972501', status: 'active', remaining_seconds: 0 });
    await expect(service.preflight({ phone_e164: '+972501', provider_call_id: 'p', asterisk_uniqueid: 'a', started_at: '2026-01-01T00:00:00Z' }))
      .resolves.toEqual({ allowed: false, deny_prompt: 'no_minutes' });
  });

  it('preflight deny active_call_exists when lock exists and active call in db', async () => {
    accounts.findOneBy.mockResolvedValue({ phone_e164: '+972501', status: 'active', remaining_seconds: 30 });
    redis.acquireActiveCall.mockResolvedValue(false);
    calls.exist.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const res = await service.preflight({ phone_e164: '+972501', provider_call_id: 'p', asterisk_uniqueid: 'a', started_at: '2026-01-01T00:00:00Z' });
    expect(res).toEqual({ allowed: false, deny_prompt: 'active_call_exists' });
  });

  it('preflight maps unexpected error to system_error deny', async () => {
    accounts.findOneBy.mockRejectedValue(new Error('db gone'));
    const res = await service.preflight({ phone_e164: '+972501', provider_call_id: 'p', asterisk_uniqueid: 'a', started_at: '2026-01-01T00:00:00Z' });
    expect(res).toEqual({ allowed: false, deny_prompt: 'system_error' });
  });

  it('idempotent payment credit', async () => {
    accounts.findOneBy.mockResolvedValue({ phone_e164: '+972', status: 'active', remaining_seconds: 10 });
    credits.findOneBy.mockResolvedValue({ payment_txn_id: 'txn1' });
    accounts.findOneByOrFail.mockResolvedValue({ phone_e164: '+972', remaining_seconds: 10 });
    const res = await service.paymentCredit({ payment_txn_id: 'txn1', phone_e164: '+972', package_code: 'P10', amount_agorot: 5000, granted_seconds: 600, provider_name: 'x', provider_status: 'approved' });
    expect(res.remaining_seconds).toBe(10);
    expect(ds.transaction).not.toHaveBeenCalled();
  });

  it('idempotent call end', async () => {
    calls.findOneBy.mockResolvedValue({ call_session_id: 'c1', phone_e164: '+972', state: 'ended', billed_seconds: 15 });
    accounts.findOneByOrFail.mockResolvedValue({ phone_e164: '+972', remaining_seconds: 90 });
    redis.releaseActiveCallIfOwner.mockResolvedValue(true);
    const res = await service.endCall({ call_session_id: 'c1', phone_e164: '+972', ended_reason: 'star_exit', ended_at: '2026-01-01T00:01:00Z' });
    expect(res).toEqual({ ok: true, billed_seconds: 15, remaining_seconds: 90 });
  });

  it('warning command creation is idempotent', async () => {
    calls.findOneBy.mockResolvedValue({ call_session_id: 'c1', state: 'connected' });
    commands.exists.mockResolvedValue(false).mockResolvedValue(true);
    await service.bridgeWarningDue('c1');
    await service.bridgeWarningDue('c1');
    expect(commands.exists).toHaveBeenCalled();
  });

  it('force-end command creation is idempotent', async () => {
    calls.findOneBy.mockResolvedValue({ call_session_id: 'c1', state: 'connected' });
    commands.exists.mockResolvedValue(false).mockResolvedValue(true);
    await service.createForceEnd('c1', 'time_expired');
    await service.createForceEnd('c1', 'time_expired');
    expect(commands.exists).toHaveBeenCalled();
  });

  it('command acknowledgment marks command acknowledged', async () => {
    commands.findOne.mockResolvedValue({ call_session_id: 'c1', command: 'play_warning', is_acknowledged: false });
    await service.ackCommand('c1', 'play_warning', '2026-01-01T00:00:01Z');
    expect(commands.save).toHaveBeenCalledTimes(1);
  });

  it('admin credit/debit writes ledger', async () => {
    ds.transaction.mockImplementation(async (fn: any) => fn({ getRepository: () => ({ findOneByOrFail: async () => ({ phone_e164: '+972', remaining_seconds: 100 }), save: jest.fn(async (v) => v), create: (v: any) => v }) }));
    await service.adminAdjust('+972', 20, 'credit', 'admin1', 'support');
    expect(ds.transaction).toHaveBeenCalled();
  });

  it('end call validates session phone match', async () => {
    calls.findOneBy.mockResolvedValue({ call_session_id: 'c1', phone_e164: '+111', state: 'connected', started_at: new Date('2026-01-01T00:00:00Z') });
    await expect(service.endCall({ call_session_id: 'c1', phone_e164: '+222', ended_reason: 'star_exit', ended_at: '2026-01-01T00:00:03Z' })).rejects.toThrow(BadRequestException);
  });
});
