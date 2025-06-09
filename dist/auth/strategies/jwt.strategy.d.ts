import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthPayload, AuthService } from '../auth.service';
declare const JwtStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtStrategy extends JwtStrategy_base {
    private authService;
    private configService;
    constructor(authService: AuthService, configService: ConfigService);
    validate(payload: AuthPayload): Promise<{
        userId: string;
        email: string;
        role: import("../entities/user.entity").UserRole;
        user: import("../entities/user.entity").User;
    }>;
}
export {};
