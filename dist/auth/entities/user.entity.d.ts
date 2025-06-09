export declare enum UserRole {
    ADMIN = "admin",
    CONTRACTOR = "contractor",
    SUBCONTRACTOR = "subcontractor",
    CLIENT = "client",
    EMPLOYEE = "employee"
}
export declare class User {
    id: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone: string;
    role: UserRole;
    companyName: string;
    isActive: boolean;
    lastLoginAt: Date;
    createdAt: Date;
    updatedAt: Date;
    hashPassword(): Promise<void>;
    validatePassword(password: string): Promise<boolean>;
}
