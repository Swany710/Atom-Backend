import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
export interface AuthPayload {
    userId: string;
    email: string;
    role: UserRole;
}
export declare class AuthService {
    private userRepository;
    private jwtService;
    constructor(userRepository: Repository<User>, jwtService: JwtService);
    validateUser(email: string, password: string): Promise<User | null>;
    login(email: string, password: string): Promise<{
        access_token: string;
        user: Partial<User>;
    }>;
    register(userData: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        companyName?: string;
        role?: UserRole;
    }): Promise<Partial<User>>;
    findById(id: string): Promise<User | null>;
    private sanitizeUser;
}
