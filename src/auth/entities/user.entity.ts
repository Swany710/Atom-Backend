import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * User Entity
 * Represents a user in the system
 *
 * ADDED: Part of authentication system integration
 * Stores user credentials and Google OAuth tokens
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  email: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ default: true })
  isActive: boolean;

  // Google OAuth fields for Gmail/Drive integration
  @Column({ nullable: true })
  googleId: string;

  @Column({ nullable: true, type: 'text' })
  googleAccessToken: string;

  @Column({ nullable: true, type: 'text' })
  googleRefreshToken: string;

  @Column({ type: 'timestamp', nullable: true })
  googleTokenExpiry: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Remove sensitive data before sending to client
   */
  toJSON() {
    const { password, googleAccessToken, googleRefreshToken, ...user } = this;
    return user;
  }
}
