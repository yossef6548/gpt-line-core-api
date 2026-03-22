import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CoreService } from '../services/core.service';
import { AdminAdjustDto } from '../dto/internal.dto';
import { AdminTokenGuard } from '../guards/admin-token.guard';

@Controller('/admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  constructor(private readonly core: CoreService) {}

  @Get('/summary')
  summary() { return this.core.adminSummary(); }

  @Get('/accounts')
  listAccounts(@Query('search') search?: string, @Query('status') status?: string, @Query('page') page?: string) {
    return this.core.adminListAccounts(search, status, Number(page ?? 1));
  }

  @Get('/accounts/:phone_e164')
  getAccount(@Param('phone_e164') phone: string) { return this.core.adminGetAccount(phone); }

  @Post('/accounts/:phone_e164/block')
  block(@Param('phone_e164') phone: string, @Headers('x-admin-identity') identity = 'unknown') { return this.core.adminSetStatus(phone, 'blocked', identity); }

  @Post('/accounts/:phone_e164/unblock')
  unblock(@Param('phone_e164') phone: string, @Headers('x-admin-identity') identity = 'unknown') { return this.core.adminSetStatus(phone, 'active', identity); }

  @Post('/accounts/:phone_e164/credit')
  credit(@Param('phone_e164') phone: string, @Body() body: AdminAdjustDto, @Headers('x-admin-identity') identity = 'unknown') {
    return this.core.adminAdjust(phone, body.seconds, 'credit', identity);
  }

  @Post('/accounts/:phone_e164/debit')
  debit(@Param('phone_e164') phone: string, @Body() body: AdminAdjustDto, @Headers('x-admin-identity') identity = 'unknown') {
    return this.core.adminAdjust(phone, body.seconds, 'debit', identity);
  }

  @Get('/calls')
  listCalls(@Query('page') page?: string, @Query('phone') phone?: string, @Query('state') state?: string) {
    return this.core.adminListCalls(Number(page ?? 1), phone, state);
  }

  @Get('/calls/:call_session_id')
  getCall(@Param('call_session_id') id: string) { return this.core.adminGetCall(id); }

  @Post('/calls/:call_session_id/terminate')
  terminate(@Param('call_session_id') id: string, @Headers('x-admin-identity') identity = 'unknown') {
    return this.core.adminTerminate(id, identity);
  }
}
