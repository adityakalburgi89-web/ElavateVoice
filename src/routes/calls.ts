import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';
import { omniDimensionProvider } from '../providers/telephony/omniDimensionProvider.js';
import { callStateStore } from '../services/callStateStore.js';
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

  // GET /calls - List all calls
  app.get('/calls', async (_request, reply) => {
    const calls = callStateStore.getAllCalls();
    return reply.status(200).send({
      success: true,
      count: calls.length,
      calls,
    });
  });
}
