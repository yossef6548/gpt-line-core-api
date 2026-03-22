import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';
import { BRIDGE_COMMANDS, CALL_ENDED_REASONS, PAYMENT_PROVIDER_STATUSES } from '../common/enums';
import { PHONE_REGEX } from '../common/validators';

export class EnsureCallerDto {
  @Matches(PHONE_REGEX) phone_e164!: string;
  @IsString() source!: string;
  @IsString() provider_call_id!: string;
}

export class PreflightDto {
  @Matches(PHONE_REGEX) phone_e164!: string;
  @IsString() provider_call_id!: string;
  @IsString() asterisk_uniqueid!: string;
  @IsDateString() started_at!: string;
}

export class EndCallDto {
  @IsString() call_session_id!: string;
  @Matches(PHONE_REGEX) phone_e164!: string;
  @IsIn(CALL_ENDED_REASONS) ended_reason!: (typeof CALL_ENDED_REASONS)[number];
  @IsDateString() ended_at!: string;
}

export class AckCommandDto {
  @IsString() call_session_id!: string;
  @IsIn(BRIDGE_COMMANDS) command!: (typeof BRIDGE_COMMANDS)[number];
  @IsDateString() executed_at!: string;
}

export class BridgeConnectedDto {
  @IsString() call_session_id!: string;
  @Matches(PHONE_REGEX) phone_e164!: string;
  @IsDateString() connected_at!: string;
}

export class BridgeWarningDueDto {
  @IsString() call_session_id!: string;
  @Matches(PHONE_REGEX) phone_e164!: string;
  @IsInt() @Min(0) remaining_seconds!: number;
}

export class BridgeCutoffDueDto {
  @IsString() call_session_id!: string;
  @Matches(PHONE_REGEX) phone_e164!: string;
}

export class BridgeEndedDto {
  @IsString() call_session_id!: string;
  @Matches(PHONE_REGEX) phone_e164!: string;
  @IsDateString() ended_at!: string;
  @IsIn(CALL_ENDED_REASONS) reason!: (typeof CALL_ENDED_REASONS)[number];
}

export class PaymentCreditDto {
  @IsString() payment_txn_id!: string;
  @Matches(PHONE_REGEX) phone_e164!: string;
  @IsString() package_code!: string;
  @IsInt() @Min(1) amount_agorot!: number;
  @IsInt() @Min(1) granted_seconds!: number;
  @IsString() provider_name!: string;
  @IsIn(PAYMENT_PROVIDER_STATUSES) provider_status!: (typeof PAYMENT_PROVIDER_STATUSES)[number];
}

export class AdminReasonDto {
  @IsOptional() @IsString() @IsNotEmpty() reason?: string;
}

export class AdminBlockAccountDto {
  @IsOptional() @IsString() @IsNotEmpty() reason?: string;
}

export class AdminUnblockAccountDto {
  @IsOptional() @IsString() @IsNotEmpty() reason?: string;
}

export class AdminAdjustDto {
  @IsInt() @Min(1) seconds!: number;
  @IsOptional() @IsString() @IsNotEmpty() reason?: string;
}

export class AdminTerminateCallDto {
  @IsOptional() @IsString() @IsNotEmpty() reason?: string;
}
