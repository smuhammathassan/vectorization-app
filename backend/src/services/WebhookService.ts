import crypto from 'crypto';
import { Logger } from '../utils/logger';

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  createdAt: Date;
  lastTriggered?: Date;
  failureCount: number;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: any;
  timestamp: Date;
  webhookId: string;
}

// In-memory webhook store (use database in production)
const webhookStore = new Map<string, Webhook>();
const eventQueue: WebhookEvent[] = [];

export class WebhookService {
  // Register a webhook
  async registerWebhook(url: string, events: string[], secret?: string): Promise<Webhook> {
    const webhook: Webhook = {
      id: `webhook_${Date.now()}`,
      url,
      events,
      secret: secret || crypto.randomBytes(32).toString('hex'),
      isActive: true,
      createdAt: new Date(),
      failureCount: 0
    };
    
    webhookStore.set(webhook.id, webhook);
    
    Logger.info('Webhook registered', {
      webhookId: webhook.id,
      url: webhook.url,
      events: webhook.events
    });
    
    return webhook;
  }

  // Send webhook event
  async sendEvent(type: string, data: any): Promise<void> {
    const event: WebhookEvent = {
      id: `event_${Date.now()}`,
      type,
      data,
      timestamp: new Date(),
      webhookId: ''
    };

    // Find webhooks that should receive this event
    const relevantWebhooks = Array.from(webhookStore.values()).filter(
      webhook => webhook.isActive && webhook.events.includes(type)
    );

    // Send to each relevant webhook
    for (const webhook of relevantWebhooks) {
      try {
        await this.deliverEvent(webhook, { ...event, webhookId: webhook.id });
        webhook.lastTriggered = new Date();
        webhook.failureCount = 0; // Reset on success
      } catch (error) {
        webhook.failureCount++;
        Logger.error('Webhook delivery failed', error as Error, {
          webhookId: webhook.id,
          eventType: type,
          failureCount: webhook.failureCount
        });

        // Disable webhook after 5 failures
        if (webhook.failureCount >= 5) {
          webhook.isActive = false;
          Logger.warn('Webhook disabled due to repeated failures', {
            webhookId: webhook.id,
            url: webhook.url
          });
        }
      }
    }
  }

  // Deliver event to specific webhook
  private async deliverEvent(webhook: Webhook, event: WebhookEvent): Promise<void> {
    const payload = {
      id: event.id,
      type: event.type,
      created: event.timestamp.toISOString(),
      data: event.data
    };

    const signature = this.generateSignature(JSON.stringify(payload), webhook.secret);
    
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': event.type,
        'User-Agent': 'VectorizationAPI/1.0'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  // Generate HMAC signature for webhook security
  private generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  // Verify webhook signature
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  // Get all webhooks
  getAllWebhooks(): Webhook[] {
    return Array.from(webhookStore.values());
  }

  // Get webhook by ID
  getWebhook(id: string): Webhook | null {
    return webhookStore.get(id) || null;
  }

  // Update webhook
  async updateWebhook(id: string, updates: Partial<Webhook>): Promise<Webhook | null> {
    const webhook = webhookStore.get(id);
    if (!webhook) return null;

    Object.assign(webhook, updates);
    webhookStore.set(id, webhook);
    
    return webhook;
  }

  // Delete webhook
  async deleteWebhook(id: string): Promise<boolean> {
    return webhookStore.delete(id);
  }
}

// Event types
export const WebhookEvents = {
  FILE_UPLOADED: 'file.uploaded',
  FILE_DELETED: 'file.deleted',
  CONVERSION_STARTED: 'conversion.started',
  CONVERSION_COMPLETED: 'conversion.completed',
  CONVERSION_FAILED: 'conversion.failed',
  USER_CREATED: 'user.created',
  API_KEY_CREATED: 'api_key.created',
  API_KEY_REVOKED: 'api_key.revoked'
} as const;

// Global webhook service instance
export const webhookService = new WebhookService();