import { CoreService } from '../../src/services/core.service';

describe('CoreService partial logic', () => {
  const service = new CoreService(
    {} as any,
    { acquireActiveCall: jest.fn(), releaseActiveCall: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('returns force-end and warning ok envelope methods', async () => {
    jest.spyOn(service, 'createForceEnd').mockResolvedValue();
    await expect(service.bridgeCutoffDue('id')).resolves.toEqual({ ok: true });
  });
});
