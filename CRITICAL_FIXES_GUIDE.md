# 🚨 Critical Errors & High Priority Issues - Solution Guide

## Quick Navigation
- [Critical Error #1: Invalid OpenAI Model](#critical-error-1-invalid-openai-model)
- [Critical Error #2: Hardcoded JWT Secrets](#critical-error-2-hardcoded-jwt-secrets)
- [Critical Error #3: Dangerous CORS Configuration](#critical-error-3-dangerous-cors-configuration)
- [High Priority Issues](#high-priority-issues)
- [Implementation Checklist](#implementation-checklist)

---

# 🔴 CRITICAL ERRORS (Fix Immediately)

## Critical Error #1: Invalid OpenAI Model

### Problem
**File:** `src/ai/ai-voice.service.ts` (lines 81, 284, 329)
**Status:** 🔴 **BLOCKER** - Application will crash on every AI request

**Current Code:**
```typescript
model: 'gpt-4.1-mini',  // ❌ This model doesn't exist
```

**Error You'll See:**
```json
{
  "error": {
    "message": "The model `gpt-4.1-mini` does not exist",
    "type": "invalid_request_error",
    "code": "model_not_found"
  }
}
```

### Solution

**Step 1:** Open `src/ai/ai-voice.service.ts`

**Step 2:** Replace ALL 3 occurrences (lines 81, 284, 329):

**Find:**
```typescript
model: 'gpt-4.1-mini',
```

**Replace with:**
```typescript
model: 'gpt-4o-mini',
```

**Complete Fixed Code (3 locations):**

**Location 1: Line 81** (runChatCompletion method)
```typescript
const completion = await this.openai.chat.completions.create({
  model: 'gpt-4o-mini',  // ✅ FIXED
  messages,
  max_tokens: 500,
  temperature: 0.7,
});
```

**Location 2: Line 284** (runChatWithTools method)
```typescript
let completion = await this.openai.chat.completions.create({
  model: 'gpt-4o-mini',  // ✅ FIXED
  messages,
  tools,
  tool_choice: 'auto',
  max_tokens: 1000,
  temperature: 0.7,
});
```

**Location 3: Line 329** (runChatWithTools method - second call)
```typescript
completion = await this.openai.chat.completions.create({
  model: 'gpt-4o-mini',  // ✅ FIXED
  messages,
  max_tokens: 1000,
  temperature: 0.7,
});
```

**Model Options:**
```typescript
// Option 1: Best for production (cheap, fast, good quality)
model: 'gpt-4o-mini',     // $0.15/$0.60 per 1M tokens

// Option 2: Higher quality (more expensive)
model: 'gpt-4o',          // $2.50/$10 per 1M tokens

// Option 3: Budget option (older model)
model: 'gpt-3.5-turbo',   // $0.50/$1.50 per 1M tokens
```

**Verification:**
```bash
npm run build  # Should succeed
# Then test AI endpoint
curl -X POST http://localhost:3000/api/v1/ai/text \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
```

---

## Critical Error #2: Hardcoded JWT Secrets

### Problem
**File:** `src/auth/auth.service.ts` (lines 201, 216)
**Status:** 🔴 **SECURITY CRITICAL** - Attackers can forge authentication tokens

**Current Code:**
```typescript
private generateAccessToken(user: User): string {
  const payload = { sub: user.id, email: user.email };
  return this.jwtService.sign(payload, {
    secret: this.configService.get<string>('JWT_SECRET', 'default-secret'),  // ❌ DANGER
    expiresIn: this.configService.get<string>('JWT_EXPIRATION', '7d'),
  });
}

private generateRefreshToken(user: User): string {
  const payload = { sub: user.id, email: user.email };
  return this.jwtService.sign(payload, {
    secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'default-refresh-secret'),  // ❌ DANGER
    expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION', '30d'),
  });
}
```

**Why This Is Critical:**
- If `.env` file is missing or misconfigured, app uses "default-secret"
- Anyone can crack this and create fake admin tokens
- Silent failure - you won't know secrets are weak until you're hacked

### Solution

**Step 1:** Open `src/auth/auth.service.ts`

**Step 2:** Replace the token generation methods:

```typescript
/**
 * Generate JWT access token
 * @param user User object
 * @returns Access token
 */
private generateAccessToken(user: User): string {
  const payload = { sub: user.id, email: user.email };

  // ✅ FIXED: No default - fail fast if missing
  const secret = this.configService.get<string>('JWT_SECRET');
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  const expiresIn = this.configService.get<string>('JWT_EXPIRATION', '7d');

  return this.jwtService.sign(payload, {
    secret,
    expiresIn,
  });
}

/**
 * Generate JWT refresh token
 * @param user User object
 * @returns Refresh token
 */
private generateRefreshToken(user: User): string {
  const payload = { sub: user.id, email: user.email };

  // ✅ FIXED: No default - fail fast if missing
  const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET environment variable is required');
  }

  const expiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRATION', '30d');

  return this.jwtService.sign(payload, {
    secret,
    expiresIn,
  });
}
```

**Step 3:** Also fix the refreshToken method (line 108-112):

**Find:**
```typescript
const payload = this.jwtService.verify(refreshToken, {
  secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'default-refresh-secret'),
});
```

**Replace with:**
```typescript
const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
if (!secret) {
  throw new UnauthorizedException('JWT configuration error');
}

const payload = this.jwtService.verify(refreshToken, { secret });
```

**Step 4:** Generate secure secrets for your `.env` file:

```bash
# Generate strong secrets (run these commands)
openssl rand -base64 64  # Use for JWT_SECRET
openssl rand -base64 64  # Use for JWT_REFRESH_SECRET
```

**Step 5:** Update your `.env` file:

```env
# Copy output from openssl commands above
JWT_SECRET=<paste-64-char-random-string-here>
JWT_REFRESH_SECRET=<paste-different-64-char-random-string-here>
JWT_EXPIRATION=7d
JWT_REFRESH_EXPIRATION=30d
```

**Verification:**
```bash
# Test that app fails to start without secrets
unset JWT_SECRET
npm run start:dev  # Should crash with clear error message

# Test that app works with proper secrets
# (Add secrets to .env first)
npm run start:dev  # Should start successfully
```

---

## Critical Error #3: Dangerous CORS Configuration

### Problem
**File:** `src/main.ts` (lines 9-14)
**Status:** 🔴 **SECURITY CRITICAL** - Open to CSRF attacks

**Current Code:**
```typescript
app.enableCors({
  origin: true,  // ❌ Allows ANY website to make requests
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

**Why This Is Critical:**
- `origin: true` allows requests from ANY domain
- Attackers can create fake sites that steal user data
- Combined with `credentials: true`, enables session hijacking
- GDPR/compliance violations

### Solution

**Step 1:** Open `src/main.ts`

**Step 2:** Replace the CORS configuration:

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ FIXED: Environment-aware CORS configuration
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
    : ['http://localhost:3000', 'http://localhost:3001'];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // Check if origin is allowed
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`Blocked CORS request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    maxAge: 86400, // Cache preflight for 24 hours
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Atom Backend running on port ${port}`);
  console.log(`✅ CORS enabled for: ${allowedOrigins.join(', ')}`);
}
bootstrap();
```

**Step 3:** Update your `.env` file:

```env
# Development
FRONTEND_URL=http://localhost:3000,http://localhost:3001,http://localhost:5173

# Production (example)
# FRONTEND_URL=https://app.yourcompany.com,https://admin.yourcompany.com
```

**Step 4:** For production deployments, use strict origins:

```env
# Production .env
FRONTEND_URL=https://app.atomai.com
NODE_ENV=production
```

**Verification:**
```bash
# Test allowed origin
curl -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS http://localhost:3000/api/v1/ai/health

# Should return: Access-Control-Allow-Origin: http://localhost:3000

# Test blocked origin
curl -H "Origin: https://evil-site.com" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS http://localhost:3000/api/v1/ai/health

# Should return: CORS error or no Access-Control-Allow-Origin header
```

---

# ⚠️ HIGH PRIORITY ISSUES

## High Priority #1: Database Auto-Sync in Production

### Problem
**File:** `src/app.module.ts` (line 25)
**Status:** ⚠️ **DATA LOSS RISK**

**Current Code:**
```typescript
TypeOrmModule.forRootAsync({
  useFactory: () => ({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    synchronize: true,  // ❌ DANGEROUS - Auto-drops/recreates tables
    autoLoadEntities: true,
  }),
}),
```

**Why This Is Dangerous:**
- In production, schema changes auto-apply without migrations
- Can DROP columns/tables and DELETE user data
- No rollback capability
- No version control of database changes

### Solution

**Step 1:** Open `src/app.module.ts`

**Step 2:** Make synchronization environment-aware:

```typescript
TypeOrmModule.forRootAsync({
  useFactory: () => ({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    synchronize: process.env.NODE_ENV !== 'production',  // ✅ FIXED: Only in dev
    autoLoadEntities: true,
    logging: process.env.NODE_ENV === 'development',
    // Additional production safety
    extra: {
      max: 20,  // Connection pool size
      connectionTimeoutMillis: 5000,
    },
  }),
}),
```

**Step 3:** Add migration support:

Create `src/database/migrations/1703000000000-initial.ts`:
```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1703000000000 implements MigrationInterface {
  name = 'Initial1703000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pgvector extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

    // Your schema creation queries will be here
    // TypeORM can generate these for you
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback queries
  }
}
```

**Step 4:** Update `package.json` scripts:

```json
{
  "scripts": {
    "migration:generate": "typeorm migration:generate -d src/database/data-source.ts",
    "migration:run": "typeorm migration:run -d src/database/data-source.ts",
    "migration:revert": "typeorm migration:revert -d src/database/data-source.ts"
  }
}
```

**Step 5:** Create `src/database/data-source.ts`:

```typescript
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: true,
});
```

**Verification:**
```bash
# Generate migration
npm run migration:generate -- src/database/migrations/initial

# Run migration
npm run migration:run
```

---

## High Priority #2: Missing pgvector Extension Setup

### Problem
**Files:** `src/knowledge-base/entities/document-chunk.entity.ts`
**Status:** ⚠️ **DEPLOYMENT BLOCKER**

**Current Code:**
```typescript
@Column({
  type: 'vector',
  length: 1536,
  nullable: true,
})
@Index('document_chunks_embedding_idx', { synchronize: false })
embedding: number[];
```

**Issues:**
- pgvector extension won't auto-install
- Vector index won't auto-create (`synchronize: false`)
- Fresh database deployments will fail

### Solution

**Step 1:** Create `scripts/init-database.sql`:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Create vector index for embeddings (after table exists)
-- Note: This runs after TypeORM creates the tables
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
ON document_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create index for faster user-based queries
CREATE INDEX IF NOT EXISTS idx_documents_user_id
ON documents (user_id);

-- Performance optimization: Analyze tables
ANALYZE document_chunks;
ANALYZE documents;
```

**Step 2:** Create `scripts/setup-database.sh`:

```bash
#!/bin/bash

# Database initialization script
set -e

echo "🔧 Setting up Atom Backend database..."

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL not set"
  exit 1
fi

echo "📊 Installing pgvector extension..."
psql $DATABASE_URL -f scripts/init-database.sql

echo "✅ Database setup complete!"
```

**Step 3:** Make script executable:

```bash
chmod +x scripts/setup-database.sh
```

**Step 4:** Update deployment workflow:

Add to your deployment process (Railway, Docker, etc.):

```yaml
# railway.toml (for Railway deployments)
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm run migration:run && npm run start:prod"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[deploy.healthcheckPath]
path = "/api/v1/ai/health"
```

**For Docker (Dockerfile):**

```dockerfile
# Add after dependencies install
COPY scripts/init-database.sql ./scripts/
RUN chmod +x scripts/setup-database.sh

# In startup command
CMD ["sh", "-c", "./scripts/setup-database.sh && npm run start:prod"]
```

**Verification:**
```bash
# Run setup script
./scripts/setup-database.sh

# Verify pgvector
psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'vector';"

# Should show:
#  extname | extversion
# ---------+------------
#  vector  | 0.5.1
```

---

## High Priority #3: Missing Environment Variable Validation

### Problem
**File:** `src/app.module.ts`
**Status:** ⚠️ **RUNTIME FAILURES**

**Current Behavior:**
- App starts even if critical env vars are missing
- Crashes later when trying to use missing config
- Cryptic error messages

### Solution

**Step 1:** Create `src/config/env.validation.ts`:

```typescript
import { plainToInstance } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  validateSync,
  IsUrl,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  // Database
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  // JWT Authentication
  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRATION?: string = '7d';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRATION?: string = '30d';

  // OpenAI
  @IsString()
  @IsNotEmpty()
  OPENAI_API_KEY: string;

  // Google OAuth (optional in dev)
  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_SECRET?: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  GOOGLE_REDIRECT_URI?: string;

  // Tavily (optional)
  @IsString()
  @IsOptional()
  TAVILY_API_KEY?: string;

  // Microsoft (optional)
  @IsString()
  @IsOptional()
  MICROSOFT_TENANT_ID?: string;

  @IsString()
  @IsOptional()
  MICROSOFT_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  MICROSOFT_CLIENT_SECRET?: string;

  // Application
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV?: Environment = Environment.Development;

  @IsString()
  @IsOptional()
  PORT?: string = '3000';

  @IsString()
  @IsOptional()
  FRONTEND_URL?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => {
        const constraints = Object.values(error.constraints || {});
        return `  ❌ ${error.property}: ${constraints.join(', ')}`;
      })
      .join('\n');

    throw new Error(
      `\n🚨 Environment Validation Failed:\n\n${errorMessages}\n\nPlease check your .env file and ensure all required variables are set.\n`,
    );
  }

  return validatedConfig;
}
```

**Step 2:** Update `src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validate } from './config/env.validation';  // ✅ ADD THIS

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate,  // ✅ ADD THIS - Validates on startup
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        synchronize: process.env.NODE_ENV !== 'production',
        autoLoadEntities: true,
      }),
    }),
    // ... rest of imports
  ],
})
export class AppModule {}
```

**Verification:**
```bash
# Test with missing variable
cp .env .env.backup
echo "# Invalid config" > .env
npm run start:dev

# Should show clear error:
# 🚨 Environment Validation Failed:
#   ❌ DATABASE_URL: DATABASE_URL should not be empty
#   ❌ JWT_SECRET: JWT_SECRET should not be empty
#   ❌ OPENAI_API_KEY: OPENAI_API_KEY should not be empty

# Restore and test
mv .env.backup .env
npm run start:dev  # Should start successfully
```

---

## High Priority #4: No Test Coverage

### Problem
**Status:** ⚠️ **ZERO TESTS** - Cannot guarantee code quality

**Current State:**
- 0% test coverage
- No unit tests
- No integration tests
- No E2E tests
- Cannot safely refactor

### Solution

**Step 1:** Install testing dependencies (already in package.json):

```bash
npm install --save-dev @nestjs/testing jest ts-jest supertest
```

**Step 2:** Create `test/jest-e2e.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  }
}
```

**Step 3:** Create `src/auth/auth.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Repository<User>;
  let jwtService: JwtService;

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(() => 'mock-token'),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config = {
        JWT_SECRET: 'test-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_EXPIRATION: '7d',
        JWT_REFRESH_EXPIRATION: '30d',
      };
      return config[key] || defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue({
        id: '123',
        ...registerDto,
      });
      mockUserRepository.save.mockResolvedValue({
        id: '123',
        ...registerDto,
      });

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(registerDto.email);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
    });

    it('should throw ConflictException if email already exists', async () => {
      const registerDto = {
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      mockUserRepository.findOne.mockResolvedValue({ id: '123' });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    it('should successfully login a user', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const user = {
        id: '123',
        email: loginDto.email,
        password: await bcrypt.hash(loginDto.password, 10),
        isActive: true,
      };

      mockUserRepository.findOne.mockResolvedValue(user);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(loginDto.email);
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for inactive account', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const user = {
        id: '123',
        email: loginDto.email,
        password: await bcrypt.hash(loginDto.password, 10),
        isActive: false,
      };

      mockUserRepository.findOne.mockResolvedValue(user);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
```

**Step 4:** Create E2E test `test/auth.e2e-spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Authentication (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `test-${Date.now()}@example.com`,
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
          expect(res.body.user).toHaveProperty('email');
        });
    });

    it('should return 409 for duplicate email', async () => {
      const email = `duplicate-${Date.now()}@example.com`;

      // Register first time
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email,
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201);

      // Try to register again
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email,
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(409);
    });
  });

  describe('/auth/login (POST)', () => {
    it('should login with valid credentials', async () => {
      const email = `login-${Date.now()}@example.com`;
      const password = 'password123';

      // Register user
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email,
          password,
          firstName: 'Test',
          lastName: 'User',
        });

      // Login
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
        });
    });

    it('should return 401 for invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });
  });
});
```

**Step 5:** Add test scripts to `package.json`:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  }
}
```

**Step 6:** Create `jest.config.js`:

```javascript
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.spec.ts',
    '!**/*.entity.ts',
    '!**/*.dto.ts',
    '!**/main.ts',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  coverageThresholds: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
};
```

**Verification:**
```bash
# Run unit tests
npm test

# Run with coverage
npm run test:cov

# Run E2E tests
npm run test:e2e

# Watch mode
npm run test:watch
```

---

## High Priority #5: Add Rate Limiting

### Problem
**Status:** ⚠️ **COST & SECURITY RISK**

**Issues:**
- No rate limiting on expensive AI operations
- Vulnerable to API abuse
- Can cause massive OpenAI bills
- DoS attack vector

### Solution

**Step 1:** Install throttler:

```bash
npm install @nestjs/throttler
```

**Step 2:** Update `src/app.module.ts`:

```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    // ... existing imports

    // ✅ ADD: Rate limiting
    ThrottlerModule.forRoot([{
      ttl: 60000,  // 60 seconds
      limit: 10,   // 10 requests per 60 seconds
    }]),
  ],
  providers: [
    // ... existing providers

    // ✅ ADD: Apply globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
```

**Step 3:** Add custom limits for expensive endpoints:

Update `src/ai/ai-voice.controller.ts`:

```typescript
import { Throttle } from '@nestjs/throttler';

@Controller('api/v1/ai')
export class AIVoiceController {
  // ... existing code

  @Post('voice')
  @Throttle({ default: { limit: 5, ttl: 60000 } })  // ✅ 5 voice requests per minute
  @UseInterceptors(FileInterceptor('audio'))
  async handleVoiceCommand(/* ... */) {
    // ... existing code
  }

  @Post('text')
  @Throttle({ default: { limit: 20, ttl: 60000 } })  // ✅ 20 text requests per minute
  async handleTextCommand(/* ... */) {
    // ... existing code
  }
}
```

**Step 4:** Add user-specific rate limiting (optional but recommended):

Create `src/shared/guards/user-throttler.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Rate limit per user instead of per IP
    return req.user?.id || req.ip;
  }
}
```

**Verification:**
```bash
# Test rate limiting
for i in {1..15}; do
  curl -X POST http://localhost:3000/api/v1/ai/text \
    -H "Content-Type: application/json" \
    -d '{"message": "test"}' &
done

# After 10 requests, should get:
# {"statusCode":429,"message":"ThrottlerException: Too Many Requests"}
```

---

# 📋 IMPLEMENTATION CHECKLIST

## Critical Fixes (Do Now - 30 minutes)

```bash
# 1. Fix OpenAI Model Name
- [ ] Open src/ai/ai-voice.service.ts
- [ ] Replace 'gpt-4.1-mini' with 'gpt-4o-mini' (3 locations: lines 81, 284, 329)
- [ ] Save file
- [ ] Test: npm run build

# 2. Fix JWT Secrets
- [ ] Open src/auth/auth.service.ts
- [ ] Update generateAccessToken method (add secret validation)
- [ ] Update generateRefreshToken method (add secret validation)
- [ ] Update refreshToken method (add secret validation)
- [ ] Generate secrets: openssl rand -base64 64 (run twice)
- [ ] Update .env with new secrets
- [ ] Test: npm run start:dev (should fail without secrets, work with them)

# 3. Fix CORS Configuration
- [ ] Open src/main.ts
- [ ] Replace CORS config with environment-aware version
- [ ] Update .env with FRONTEND_URL
- [ ] Test: curl with different origins

# 4. Fix Database Sync
- [ ] Open src/app.module.ts
- [ ] Change synchronize to: process.env.NODE_ENV !== 'production'
- [ ] Test in dev: npm run start:dev
```

## High Priority (This Week - 4 hours)

```bash
# 5. Setup pgvector
- [ ] Create scripts/init-database.sql
- [ ] Create scripts/setup-database.sh
- [ ] Make executable: chmod +x scripts/setup-database.sh
- [ ] Run: ./scripts/setup-database.sh
- [ ] Verify: psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'vector';"

# 6. Add Environment Validation
- [ ] Create src/config/env.validation.ts
- [ ] Update src/app.module.ts to use validation
- [ ] Test: Remove .env and verify app crashes with clear error
- [ ] Test: Restore .env and verify app starts

# 7. Add Rate Limiting
- [ ] Install: npm install @nestjs/throttler
- [ ] Update src/app.module.ts with ThrottlerModule
- [ ] Add @Throttle decorators to AI endpoints
- [ ] Test with multiple rapid requests

# 8. Start Adding Tests
- [ ] Create src/auth/auth.service.spec.ts
- [ ] Create test/auth.e2e-spec.ts
- [ ] Create jest.config.js
- [ ] Run: npm test
- [ ] Run: npm run test:cov (aim for >50%)
```

## Verification Commands

```bash
# After all fixes, run these to verify:

# 1. Build succeeds
npm run build

# 2. Tests pass
npm test
npm run test:e2e

# 3. App starts with proper config
npm run start:dev

# 4. Health check works
curl http://localhost:3000/api/v1/ai/health

# 5. AI endpoint works
curl -X POST http://localhost:3000/api/v1/ai/text \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, test the fixed OpenAI model"}'

# 6. Rate limiting works
for i in {1..15}; do curl -X POST http://localhost:3000/api/v1/ai/text \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}'; done

# Should get 429 after 10 requests
```

---

## Summary

**Total Time to Fix All Critical Issues:** ~2-4 hours

**Priority Order:**
1. ⚠️ **CRITICAL** - OpenAI model name (5 min)
2. ⚠️ **CRITICAL** - JWT secrets (15 min)
3. ⚠️ **CRITICAL** - CORS config (10 min)
4. ⚠️ **HIGH** - Database sync (5 min)
5. ⚠️ **HIGH** - pgvector setup (30 min)
6. ⚠️ **HIGH** - Environment validation (30 min)
7. ⚠️ **HIGH** - Rate limiting (20 min)
8. ⚠️ **HIGH** - Tests (2-3 hours)

Once these are fixed, your backend will be production-ready! 🚀
