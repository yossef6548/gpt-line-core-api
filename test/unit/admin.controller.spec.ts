import { BadRequestException } from '@nestjs/common';
import { AdminController } from '../../src/controllers/admin.controller';

describe('AdminController identity enforcement', () => {
  const core = {
    adminSetStatus: jest.fn(),
    adminTerminate: jest.fn(),
  } as any;

  beforeEach(() => jest.resetAllMocks());

  it('rejects missing identity on block', async () => {
    const controller = new AdminController(core);
    expect(() => controller.block('+972501234567', { reason: 'fraud' }, undefined)).toThrow(BadRequestException);
  });

  it('passes identity on terminate', async () => {
    core.adminTerminate.mockResolvedValue({ ok: true });
    const controller = new AdminController(core);
    await controller.terminate('call_1', { reason: 'ops' }, 'admin@test');
    expect(core.adminTerminate).toHaveBeenCalledWith('call_1', 'admin@test', 'ops');
  });
});
