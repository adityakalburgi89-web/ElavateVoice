import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';
import { omniDimensionProvider } from '../providers/telephony/omniDimensionProvider.js';
import { SarvamSTTProvider } from '../providers/stt/sarvamSTTProvider.js';
import { SarvamTTSProvider } from '../providers/tts/sarvamTTSProvider.js';
import { GeminiLLMProvider } from '../providers/llm/geminiLLMProvider.js';
import { callStateStore } from '../services/callStateStore.js';
import { leadQualificationEngine } from '../services/leadQualificationEngine.js';
import { actionGuardrails } from '../services/actionGuardrails.js';
import { midCallWhatsAppService } from '../services/midCallWhatsAppService.js';
import { callbackSchedulerService } from '../services/callbackSchedulerService.js';
import { postCallWorkflowService } from '../services/postCallWorkflowService.js';
import { CallStatus } from '../types/callState.js';

interface StartCallBody {
  phoneNumber?: string;
}

interface WebhookBody {
  event_id?: string;
  call_id?: string;
  callId?: string;
  event?: string;
  status?: string;
  timestamp?: string;
  transcript?: string;
  role?: 'user' | 'assistant';
}

interface StartCallRoute {
  Body: StartCallBody;
}

interface WebhookRoute {
  Body: WebhookBody;
}

interface GetCallParams {
  Params: {
    callId: string;
  };
}

export async function registerCallRoutes(app: FastifyInstance): Promise<void> {
  // POST /calls/start & POST /api/calls/start
  async function handleStartCall(request: FastifyRequest<StartCallRoute>, reply: FastifyReply) {
    const targetPhoneNumber = request.body?.phoneNumber || env.DEFAULT_TARGET_PHONE_NUMBER;

    if (!targetPhoneNumber) {
      return reply.status(400).send({
        error: {
          message: 'Phone number is required. Please set DEFAULT_TARGET_PHONE_NUMBER in .env or pass phoneNumber in body.',
          statusCode: 400,
        },
      });
    }

    try {
      // 1. Create initial call record in state store
      const initialCall = callStateStore.createCall(targetPhoneNumber);
      const callId = initialCall.callId;

      const callbackUrl = `http://${env.HOST}:${env.PORT}/webhooks/telephony`;

      // 2. Initiate outbound call via provider
      const dispatchResult = await omniDimensionProvider.initiateCall({
        phoneNumber: targetPhoneNumber,
        callbackUrl,
        customData: { callId },
      });

      // 3. Update state store status
      callStateStore.updateStatus(callId, dispatchResult.status);

      // 4. Log initial bot greeting
      const botGreeting =
        'Hello! This is ElevateBox calling regarding your e-commerce website development inquiry. Can you hear me clearly?';

      callStateStore.addTranscriptItem(callId, {
        role: 'assistant',
        content: botGreeting,
        language: 'en',
      });

      request.log.info(
        { callId, phoneNumber: targetPhoneNumber, status: dispatchResult.status },
        'Automated outbound call initiated successfully',
      );

      return reply.status(201).send({
        success: true,
        callId,
        providerCallId: dispatchResult.callId,
        status: dispatchResult.status,
        phoneNumber: targetPhoneNumber,
        initialGreeting: botGreeting,
        message: 'Outbound phone call initiated automatically',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error({ err: error }, 'Failed to initiate outbound call');
      return reply.status(500).send({
        error: {
          message: `Failed to trigger outbound call: ${message}`,
          statusCode: 500,
        },
      });
    }
  }

  app.post('/calls/start', handleStartCall);
  app.post('/api/calls/start', handleStartCall);

  // POST /webhooks/telephony & POST /calls/webhook
  async function handleWebhook(request: FastifyRequest<WebhookRoute>, reply: FastifyReply) {
    const body = request.body || {};
    const callId = body.call_id || body.callId;
    const rawStatus = body.status || body.event;
    const eventId = body.event_id || `${callId}_${rawStatus}_${body.timestamp || Date.now()}`;

    if (!callId) {
      return reply.status(400).send({
        error: { message: 'Missing call_id in webhook payload', statusCode: 400 },
      });
    }

    // Idempotency check
    if (eventId && callStateStore.isWebhookProcessed(eventId)) {
      request.log.info({ eventId, callId }, 'Duplicate webhook event ignored (idempotent)');
      return reply.status(200).send({
        success: true,
        idempotent: true,
        message: 'Webhook event already processed',
      });
    }

    if (eventId) {
      callStateStore.markWebhookProcessed(eventId);
    }

    const callState = callStateStore.getCall(callId);
    if (!callState) {
      request.log.warn({ callId }, 'Webhook received for unknown callId');
      return reply.status(404).send({
        error: { message: `Call ${callId} not found in state store`, statusCode: 404 },
      });
    }

    // Map raw status to canonical CallStatus
    let newStatus: CallStatus | null = null;
    const statusLower = (rawStatus || '').toLowerCase();

    if (statusLower.includes('ring')) newStatus = 'ringing';
    else if (statusLower.includes('connect') || statusLower.includes('progress') || statusLower.includes('start')) newStatus = 'connected';
    else if (statusLower.includes('complete') || statusLower.includes('end')) newStatus = 'completed';
    else if (statusLower.includes('fail') || statusLower.includes('error')) newStatus = 'failed';
    else if (statusLower.includes('busy')) newStatus = 'busy';
    else if (statusLower.includes('no_answer')) newStatus = 'no-answer';

    if (newStatus) {
      callStateStore.updateStatus(callId, newStatus);

      // Phase 8: Trigger final post-call follow-up workflow on call termination
      if (['completed', 'failed', 'busy', 'no-answer'].includes(newStatus)) {
        postCallWorkflowService.executePostCallWorkflowAsync(callId);
      }
    }

    // Log speech transcript item if passed in webhook payload
    if (body.transcript) {
      callStateStore.addTranscriptItem(callId, {
        role: body.role || 'user',
        content: body.transcript,
      });
    }

    request.log.info({ callId, rawStatus, newStatus }, 'Telephony webhook processed successfully');

    return reply.status(200).send({
      success: true,
      callId,
      status: callState.callStatus,
      updatedAt: callState.updatedAt,
    });
  }

  app.post('/webhooks/telephony', handleWebhook);
  app.post('/calls/webhook', handleWebhook);

  // POST /calls/end - Explicitly end call and execute post-call follow-up
  app.post('/calls/end', async (request: FastifyRequest<{ Body: { callId: string } }>, reply: FastifyReply) => {
    const { callId } = request.body || {};
    if (!callId) {
      return reply.status(400).send({ error: { message: 'callId is required', statusCode: 400 } });
    }

    const callState = callStateStore.getCall(callId);
    if (!callState) {
      return reply.status(404).send({ error: { message: `Call ${callId} not found`, statusCode: 404 } });
    }

    callStateStore.updateStatus(callId, 'completed');
    const result = await postCallWorkflowService.executePostCallWorkflow(callId);

    return reply.status(200).send({
      success: true,
      callId,
      status: 'completed',
      postCallFollowUp: result,
      callState,
    });
  });

  // GET /calls/:callId - Retrieve single call state
  async function handleGetCall(request: FastifyRequest<GetCallParams>, reply: FastifyReply) {
    const { callId } = request.params;
    const callState = callStateStore.getCall(callId);

    if (!callState) {
      return reply.status(404).send({
        error: { message: `Call state for ${callId} not found`, statusCode: 404 },
      });
    }

    return reply.status(200).send({
      success: true,
      callState,
    });
  }

  app.get('/calls/:callId', handleGetCall);

  // POST /calls/turn - Process a live conversation turn
  interface TurnBody {
    callId: string;
    speechText?: string;
    audioBase64?: string;
    languageHint?: string;
    isInterrupt?: boolean;
  }

  // POST /calls/interrupt - Handle caller interruption / barge-in
  app.post('/calls/interrupt', async (request: FastifyRequest<{ Body: { callId: string; reason?: string } }>, reply: FastifyReply) => {
    const { callId, reason } = request.body || {};
    if (!callId) {
      return reply.status(400).send({ error: { message: 'callId is required', statusCode: 400 } });
    }

    const { interrupted, callState } = callStateStore.interruptCall(callId);
    request.log.info({ callId, interrupted, reason }, 'Barge-in / interruption signal processed');

    return reply.status(200).send({
      success: true,
      callId,
      interrupted,
      message: interrupted ? 'Current AI playback canceled' : 'No active speech to interrupt',
      callState,
    });
  });

  app.post('/calls/turn', async (request: FastifyRequest<{ Body: TurnBody }>, reply: FastifyReply) => {
    const startTime = Date.now();
    const { callId, speechText, audioBase64, languageHint, isInterrupt } = request.body || {};

    if (!callId) {
      return reply.status(400).send({ error: { message: 'callId is required', statusCode: 400 } });
    }

    const callState = callStateStore.getCall(callId);
    if (!callState) {
      return reply.status(404).send({ error: { message: `Call ${callId} not found`, statusCode: 404 } });
    }

    // Handle barge-in if caller speaks during active AI playback
    if (isInterrupt || callState.isSpeaking) {
      callStateStore.interruptCall(callId);
      request.log.info({ callId }, 'Barge-in triggered on active playback');
    }

    let userSpeech = speechText || '';
    let sttMs = 0;

    // 1. STT Transcribe if audio payload provided
    if (!userSpeech && audioBase64) {
      const sttStart = Date.now();
      try {
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const sttProvider = new SarvamSTTProvider();
        const sttRes = await sttProvider.transcribeAudioChunk(audioBuffer, languageHint || callState.detectedLanguage);
        userSpeech = sttRes.text;
      } catch (err: any) {
        request.log.warn({ err: err.message }, 'STT processing warning');
      }
      sttMs = Date.now() - sttStart;
    }

    // 2. Background Noise / VAD Filter
    const cleanedSpeech = (userSpeech || '').trim().toLowerCase();
    const isNoiseOrFiller =
      cleanedSpeech.length < 2 ||
      ['uh', 'um', 'ah', 'mm', 'hmm', 'oh'].includes(cleanedSpeech);

    if (isNoiseOrFiller) {
      // Ignore background noise without triggering full LLM response
      return reply.status(200).send({
        success: true,
        callId,
        userSpeech,
        ignoredAsNoise: true,
        replyText: '',
        latencies: { sttMs, llmMs: 0, ttsMs: 0, totalMs: Date.now() - startTime },
      });
    }

    // 3. Deduplication check - do not respond twice to identical utterance
    if (callStateStore.isUtteranceProcessed(userSpeech)) {
      request.log.info({ userSpeech }, 'Duplicate utterance ignored');
      return reply.status(200).send({
        success: true,
        duplicate: true,
        message: 'Utterance already processed',
      });
    }
    callStateStore.markUtteranceProcessed(userSpeech);

    // Record user speech in canonical CallState
    callStateStore.addTranscriptItem(callId, {
      role: 'user',
      content: userSpeech,
    });

    // 4. Gemini LLM Reasoning
    const llmStart = Date.now();
    const llmProvider = new GeminiLLMProvider();
    const turnOutput = await llmProvider.generateTurnResponse(callState, userSpeech);
    const llmMs = Date.now() - llmStart;

    // Update detected language in state store to maintain continuity
    if (turnOutput.detectedLanguage && turnOutput.detectedLanguage !== 'mixed') {
      callStateStore.setDetectedLanguage(callId, turnOutput.detectedLanguage);
    }

    // Accumulate newly discovered lead details into canonical CallState
    if (turnOutput.extractedFields && Object.keys(turnOutput.extractedFields).length > 0) {
      callStateStore.updateLeadDetails(callId, turnOutput.extractedFields);
    }

    // 5. Callback Scheduling & DateTime Resolution
    const callbackResult = await callbackSchedulerService.processCallbackRequest(callId, userSpeech);
    if (callbackResult.detected && callbackResult.booked && callbackResult.confirmationMessage) {
      turnOutput.replyText = callbackResult.confirmationMessage;
    } else if (callbackResult.clarificationRequired && callbackResult.clarificationPrompt) {
      turnOutput.replyText = callbackResult.clarificationPrompt;
    }

    // 6. Record assistant speech in canonical CallState
    callStateStore.addTranscriptItem(callId, {
      role: 'assistant',
      content: turnOutput.replyText,
      language: turnOutput.detectedLanguage,
    });

    // 7. Lead Qualification & Intent Decision Engine
    const qualification = await leadQualificationEngine.evaluateLead(callState, userSpeech);
    callStateStore.updateQualification(callId, qualification);

    // 8. Deterministic Action Guardrail Evaluation
    const midCallWhatsAppGuard = actionGuardrails.evaluateMidCallWhatsApp(callState, qualification);
    const callbackGuard = actionGuardrails.evaluateCallbackScheduling(callState, qualification);

    // CRITICAL REQUIREMENT: Trigger Mid-Call WhatsApp asynchronously for HOT leads (non-blocking)
    if (midCallWhatsAppGuard.authorized) {
      midCallWhatsAppService.triggerMidCallWhatsAppAsync(callId, qualification);
      request.log.info({ callId }, 'Async Mid-call WhatsApp dispatch triggered for HOT lead');
    }

    // 9. Sarvam TTS Synthesis
    const ttsStart = Date.now();
    const ttsProvider = new SarvamTTSProvider();
    const ttsResult = await ttsProvider.synthesizeSpeech(turnOutput.replyText, turnOutput.detectedLanguage);
    const ttsMs = Date.now() - ttsStart;

    // Mark AI as speaking with playback tracking
    const playbackId = `pb_${Date.now()}`;
    callStateStore.setSpeaking(callId, true, playbackId);

    const totalMs = Date.now() - startTime;
    const updatedState = callStateStore.getCall(callId);

    request.log.info(
      {
        callId,
        sttMs,
        llmMs,
        ttsMs,
        totalMs,
        language: turnOutput.detectedLanguage,
        classification: qualification.classification,
        intentScore: qualification.intentScore,
        midCallWhatsAppAuthorized: midCallWhatsAppGuard.authorized,
      },
      `Turn completed in ${totalMs}ms [${qualification.classification} (${qualification.intentScore})]`,
    );

    return reply.status(200).send({
      success: true,
      callId,
      playbackId,
      userSpeech,
      replyText: turnOutput.replyText,
      detectedLanguage: turnOutput.detectedLanguage,
      leadDetails: updatedState?.leadDetails || callState.leadDetails,
      qualification,
      callback: updatedState?.callback || callState.callback,
      guardrails: {
        midCallWhatsApp: midCallWhatsAppGuard,
        callbackScheduling: callbackGuard,
      },
      audioBase64: ttsResult.audioBuffer.toString('base64'),
      latencies: {
        sttMs,
        llmMs,
        ttsMs,
        totalMs,
      },
    });
  });

  // GET /webhooks/whatsapp - Meta webhook verification
  app.get('/webhooks/whatsapp', async (request: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) => {
    const query = request.query;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === (env.WHATSAPP_ACCESS_TOKEN || 'elevate_voice_verify_token')) {
      request.log.info('Meta WhatsApp webhook verified successfully');
      return reply.status(200).send(challenge);
    }
    return reply.status(403).send('Forbidden');
  });

  // POST /webhooks/whatsapp - Meta delivery status & incoming receipts
  app.post('/webhooks/whatsapp', async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const body = request.body;
    request.log.info({ body }, 'Received Meta WhatsApp webhook event');
    return reply.status(200).send({ status: 'received' });
  });
}
