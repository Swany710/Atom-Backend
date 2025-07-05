// src/scripts/migrate-chat-history.ts
// Run this script to migrate your existing n8n_chat_histories data

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ConversationService } from '../conversation/conversation.service';
import { MessageRole, MessageType } from '../conversation/entities/conversation-message.entity';
import { DataSource } from 'typeorm';

interface OldChatMessage {
  id: number;
  session_id: string;
  message: any; // JSON field
}

async function migrateData() {
  console.log('🚀 Starting chat history migration...');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const conversationService = app.get(ConversationService);
  const dataSource = app.get(DataSource);

  try {
    // Query existing n8n_chat_histories table
    const oldMessages = await dataSource.query(`
      SELECT id, session_id, message 
      FROM n8n_chat_histories 
      ORDER BY id ASC
    `);

    console.log(`📊 Found ${oldMessages.length} messages to migrate`);

    let migratedCount = 0;
    let sessionMap = new Map<string, string>(); // old session -> new session mapping

    for (const oldMsg of oldMessages) {
      try {
        const sessionId = oldMsg.session_id;
        const messageData = oldMsg.message;

        // Parse the message JSON
        let parsedMessage;
        if (typeof messageData === 'string') {
          parsedMessage = JSON.parse(messageData);
        } else {
          parsedMessage = messageData;
        }

        // Extract role and content from the parsed message
        let role: MessageRole;
        let content: string;
        let messageType: MessageType = MessageType.TEXT;

        if (parsedMessage.type === 'human') {
          role = MessageRole.USER;
          content = parsedMessage.content;
          // Check if it was a voice message
          if (parsedMessage.additional_kwargs?.voice || parsedMessage.content?.includes('🎤')) {
            messageType = MessageType.VOICE;
          }
        } else if (parsedMessage.type === 'ai') {
          role = MessageRole.ASSISTANT;
          content = parsedMessage.content;
        } else {
          // Skip unknown message types
          console.log(`⚠️  Skipping message with unknown type: ${parsedMessage.type}`);
          continue;
        }

        // Map old session to new session format if needed
        let newSessionId = sessionMap.get(sessionId);
        if (!newSessionId) {
          newSessionId = `migrated_${sessionId}_${Date.now()}`;
          sessionMap.set(sessionId, newSessionId);
        }

        // Add message to new conversation system
        await conversationService.addMessage({
          sessionId: newSessionId,
          userId: 'migrated-user', // You can change this to match your user system
          role,
          content,
          messageType,
          metadata: {
            migratedFrom: 'n8n_chat_histories',
            originalId: oldMsg.id,
            originalSessionId: sessionId,
            migratedAt: new Date().toISOString()
          }
        });

        migratedCount++;
        
        if (migratedCount % 10 === 0) {
          console.log(`✅ Migrated ${migratedCount}/${oldMessages.length} messages...`);
        }

      } catch (error) {
        console.error(`❌ Error migrating message ID ${oldMsg.id}:`, error);
      }
    }

    console.log(`🎉 Migration completed! Migrated ${migratedCount} messages across ${sessionMap.size} conversations`);
    
    // Print session mapping for reference
    console.log('\n📋 Session ID Mapping:');
    for (const [oldId, newId] of sessionMap) {
      console.log(`  ${oldId} -> ${newId}`);
    }

  } catch (error) {
    console.error('💥 Migration failed:', error);
  } finally {
    await app.close();
  }
}

// Alternative: Manual migration query you can run directly in Supabase
export const manualMigrationSQL = `
-- Manual migration SQL (run this in Supabase SQL editor if you prefer)

-- First, create the new tables if they don't exist (or use TypeORM sync)
-- Then run this to migrate data:

INSERT INTO conversations (id, "userId", "sessionId", title, context, metadata, "isActive", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid() as id,
  'migrated-user' as "userId",
  'migrated_' || session_id || '_' || extract(epoch from now()) as "sessionId",
  'Migrated Conversation from ' || session_id as title,
  '{}' as context,
  json_build_object('migratedFrom', 'n8n_chat_histories', 'originalSessionId', session_id) as metadata,
  true as "isActive",
  min(created_at) as "createdAt",
  max(created_at) as "updatedAt"
FROM n8n_chat_histories 
GROUP BY session_id;

-- Insert conversation messages
INSERT INTO conversation_messages (id, "conversationId", role, content, "messageType", "tokensUsed", metadata, "createdAt")
SELECT 
  gen_random_uuid() as id,
  c.id as "conversationId",
  CASE 
    WHEN (message->>'type') = 'human' THEN 'user'
    WHEN (message->>'type') = 'ai' THEN 'assistant'
    ELSE 'system'
  END as role,
  message->>'content' as content,
  'text' as "messageType",
  length(message->>'content') / 4 as "tokensUsed",
  json_build_object(
    'migratedFrom', 'n8n_chat_histories',
    'originalId', n.id,
    'originalType', message->>'type'
  ) as metadata,
  COALESCE(n.created_at, now()) as "createdAt"
FROM n8n_chat_histories n
JOIN conversations c ON c."sessionId" = 'migrated_' || n.session_id || '_' || extract(epoch from c."createdAt")
WHERE message->>'content' IS NOT NULL
ORDER BY n.id;
`;

// Export the migration function
export { migrateData };

// If running directly
if (require.main === module) {
  migrateData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}