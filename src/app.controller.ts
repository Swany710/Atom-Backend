@Post('ai/voice-command1')
  @UseInterceptors(FileInterceptor('audio'))
  async processVoiceCommand1(@UploadedFile() file: any, @Body() body: any) {
    console.log('🎤 Voice request received');
    console.log('   File exists:', !!file);
    console.log('   File size:', file?.size || 'no file');
    console.log('   File type:', file?.mimetype || 'no type');

    try {
      // Step 1: Validate file
      if (!file || !file.buffer || file.size === 0) {
        console.log('❌ No valid audio file received');
        return {
          message: "I didn't receive any audio. Please check your microphone permissions and try again.",
          transcription: '[No Audio]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      // Step 2: Check API key
      const apiKey = this.configService.get('OPENAI_API_KEY');
      if (!apiKey || !apiKey.startsWith('sk-')) {
        console.log('❌ OpenAI API key not configured');
        return {
          message: "I can hear you, but I need an OpenAI API key to process voice commands.",
          transcription: '[API Key Missing]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      console.log('🎤 Processing audio with Whisper API...');
      console.log('   Audio size:', file.size, 'bytes');

      let transcribedText = '';
      
      try {
        // DIRECT WEBM APPROACH - Send original format with minimal FormData
        const FormData = require('form-data');
        const form = new FormData();
        
        // Create a temporary file with original WebM format
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `audio_${Date.now()}.webm`);
        
        console.log('   Saving original WebM file:', tempFilePath);
        fs.writeFileSync(tempFilePath, file.buffer);
        
        // Send as WebM - Whisper should accept this
        form.append('file', fs.createReadStream(tempFilePath), {
          filename: 'audio.webm',
          contentType: 'audio/webm'
        });
        form.append('model', 'whisper-1');
        
        console.log('   Sending original WebM to Whisper API...');
        
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            ...form.getHeaders()
          },
          body: form
        });

        console.log('   Whisper response status:', response.status);

        if (response.ok) {
          const transcriptionData = await response.json();
          transcribedText = transcriptionData.text?.trim() || '';
          console.log('✅ Transcription successful with WebM:', transcribedText.substring(0, 50));
        } else {
          const errorText = await response.text();
          console.error('❌ WebM failed, trying buffer approach:', errorText);
          
          // FALLBACK: Try direct buffer approach without temp file
          try {
            console.log('   Trying direct buffer approach...');
            
            const directForm = new FormData();
            directForm.append('file', file.buffer, {
              filename: 'audio.webm',
              contentType: file.mimetype || 'audio/webm'
            });
            directForm.append('model', 'whisper-1');
            
            const directResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...directForm.getHeaders()
              },
              body: directForm
            });

            if (directResponse.ok) {
              const directData = await directResponse.json();
              transcribedText = directData.text?.trim() || '';
              console.log('✅ Transcription successful with direct buffer:', transcribedText.substring(0, 50));
            } else {
              const directError = await directResponse.text();
              console.error('❌ Direct buffer also failed:', directError);
              
              // FINAL FALLBACK: Try with different content types
              console.log('   Trying audio/ogg content type...');
              
              const oggForm = new FormData();
              oggForm.append('file', file.buffer, {
                filename: 'audio.ogg',
                contentType: 'audio/ogg'
              });
              oggForm.append('model', 'whisper-1');
              
              const oggResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  ...oggForm.getHeaders()
                },
                body: oggForm
              });

              if (oggResponse.ok) {
                const oggData = await oggResponse.json();
                transcribedText = oggData.text?.trim() || '';
                console.log('✅ Transcription successful with OGG:', transcribedText.substring(0, 50));
              } else {
                const oggError = await oggResponse.text();
                throw new Error(`All methods failed. Last error: ${oggError}`);
              }
            }
          } catch (fallbackError) {
            throw new Error(`Whisper API rejected all formats: ${errorText}`);
          }
        }

        // Clean up temp file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
          console.warn('Could not clean up temp file:', cleanupError.message);
        }

      } catch (transcriptionError) {
        console.error('❌ Transcription failed:', transcriptionError.message);
        
        return {
          message: `I had trouble understanding your voice: ${transcriptionError.message}. Please try speaking clearly into your microphone.`,
          transcription: '[Transcription Failed]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      // Validate transcription
      if (!transcribedText || transcribedText.length < 2) {
        console.log('❌ Empty or very short transcription:', transcribedText);
        return {
          message: "I couldn't understand what you said. Please try speaking more clearly or check your microphone.",
          transcription: '[Transcription Too Short]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      console.log('🤖 Processing transcribed text with GPT...');
      console.log('   Transcribed text:', transcribedText);

      // Process the transcribed text with GPT
      const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are Atom, a helpful personal AI assistant. Be friendly, conversational, and genuinely helpful. Keep responses concise but informative.'
            },
            {
              role: 'user',
              content: transcribedText
            }
          ],
          max_tokens: 500,
          temperature: 0.7,
        })
      });

      if (!chatResponse.ok) {
        console.error('❌ GPT API Error:', chatResponse.status);
        throw new Error(`GPT API error: ${chatResponse.status}`);
      }

      const chatData = await chatResponse.json();
      const aiResponse = chatData.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

      console.log('✅ Voice processing complete');

      // Store conversation
      const conversationId = body.conversationId || `voice-${Date.now()}`;
      const conversation = this.conversations.get(conversationId) || [];
      conversation.push(
        { role: 'user', content: transcribedText, timestamp: new Date() },
        { role: 'assistant', content: aiResponse, timestamp: new Date() }
      );
      this.conversations.set(conversationId, conversation);

      return {
        message: aiResponse,
        transcription: transcribedText,
        conversationId: conversationId,
        timestamp: new Date(),
        mode: 'openai'
      };

    } catch (error) {
      console.error('❌ Voice processing error:', error.message);
      
      return {
        message: `I had trouble processing your voice command: ${error.message}`,
        transcription: '[Processing Error]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error',
        error: error.message
      };
    }
  }