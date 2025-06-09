import { AuthService } from './auth.service';
import { UserRole } from './entities/user.entity';
declare class LoginDto {
    email: string;
    password: string;
}
declare class RegisterDto {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    companyName?: string;
    role?: UserRole;
}
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    login(loginDto: LoginDto): Promise<{
        access_token: string;
        user: Partial<import("./entities/user.entity").User>;
    }>;
    register(registerDto: RegisterDto): Promise<Partial<import("./entities/user.entity").User>>;
    getProfile(req: any): Promise<any>;
}
export {};
