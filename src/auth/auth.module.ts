import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { InviteCode } from './invite-code.entity';
import { InviteCodesService } from './invite-codes.service';
import { UsersModule } from '../users/users.module';
import { Organization } from '../organizations/organization.entity';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([InviteCode, Organization]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-jwt-secret-UNSAFE',
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '7d') as any,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers:   [AuthService, InviteCodesService],
  controllers: [AuthController],
  exports:     [AuthService, InviteCodesService, JwtModule],
})
export class AuthModule {}
