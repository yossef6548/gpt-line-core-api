import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import envConfig from './config/env';
import { AccountEntity } from './entities/account.entity';
import { PackageEntity } from './entities/package.entity';
import { CallSessionEntity } from './entities/call-session.entity';
import { BalanceLedgerEntity } from './entities/balance-ledger.entity';
import { PurchaseCreditEntity } from './entities/purchase-credit.entity';
import { BridgeCommandEntity } from './entities/bridge-command.entity';
import { AdminAuditLogEntity } from './entities/admin-audit-log.entity';
import { CoreService } from './services/core.service';
import { RedisService } from './redis/redis.service';
import { InternalController } from './controllers/internal.controller';
import { AdminController } from './controllers/admin.controller';
import { InternalTokenGuard } from './guards/internal-token.guard';
import { AdminTokenGuard } from './guards/admin-token.guard';

const entities = [
  AccountEntity,
  PackageEntity,
  CallSessionEntity,
  BalanceLedgerEntity,
  PurchaseCreditEntity,
  BridgeCommandEntity,
  AdminAuditLogEntity,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [envConfig] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('databaseUrl'),
        entities,
        synchronize: process.env.NODE_ENV === 'test',
      }),
    }),
    TypeOrmModule.forFeature(entities),
  ],
  controllers: [InternalController, AdminController],
  providers: [CoreService, RedisService, InternalTokenGuard, AdminTokenGuard],
})
export class AppModule {}
