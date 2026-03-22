import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CoreService } from '../services/core.service';
import { AckCommandDto, BridgeConnectedDto, BridgeCutoffDueDto, BridgeEndedDto, BridgeWarningDueDto, EndCallDto, EnsureCallerDto, PaymentCreditDto, PreflightDto } from '../dto/internal.dto';
import { InternalTokenGuard } from '../guards/internal-token.guard';

@Controller()
@UseGuards(InternalTokenGuard)
export class InternalController {
  constructor(private readonly core: CoreService) {}

  @Post('/internal/telephony/caller/ensure')
  async ensure(@Body() body: EnsureCallerDto) {
    const account = await this.core.ensureCaller(body.phone_e164);
    return { phone_e164: account.phone_e164, status: account.status };
  }

  @Get('/internal/telephony/balance/:phone_e164')
  balance(@Param('phone_e164') phone: string) {
    return this.core.balance(phone);
  }

  @Post('/internal/telephony/calls/preflight')
  preflight(@Body() body: PreflightDto) {
    return this.core.preflight(body);
  }

  @Get('/internal/telephony/calls/:call_session_id/command')
  command(@Param('call_session_id') id: string) {
    return this.core.pollCommand(id);
  }

  @Post('/internal/telephony/calls/command/ack')
  ack(@Body() body: AckCommandDto) {
    return this.core.ackCommand(body.call_session_id, body.command, body.executed_at);
  }

  @Post('/internal/telephony/calls/end')
  endCall(@Body() body: EndCallDto) {
    return this.core.endCall(body);
  }

  @Post('/internal/events/bridge-connected')
  bridgeConnected(@Body() body: BridgeConnectedDto) {
    return this.core.bridgeConnected(body.call_session_id, body.connected_at);
  }

  @Post('/internal/events/bridge-warning-due')
  bridgeWarning(@Body() body: BridgeWarningDueDto) {
    return this.core.bridgeWarningDue(body.call_session_id);
  }

  @Post('/internal/events/bridge-cutoff-due')
  bridgeCutoff(@Body() body: BridgeCutoffDueDto) {
    return this.core.bridgeCutoffDue(body.call_session_id);
  }

  @Post('/internal/events/bridge-ended')
  bridgeEnded(@Body() body: BridgeEndedDto) {
    return this.core.bridgeEnded(body);
  }

  @Post('/internal/payments/credit')
  paymentCredit(@Body() body: PaymentCreditDto) {
    return this.core.paymentCredit(body);
  }

  @Get('/internal/catalog/packages')
  packages() {
    return this.core.packageCatalog();
  }
}
