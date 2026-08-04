import { Injectable, Logger } from '@nestjs/common';

export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');

export interface OutboundMessage {
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';
  to: string;
  subject?: string;
  body: string;
}

/**
 * Adapter boundary for external messaging. Concrete providers (SendGrid, Twilio,
 * an authorized WhatsApp gateway, FCM) implement this; the app never talks to a
 * vendor SDK directly, so a deployment swaps providers via configuration.
 */
export interface NotificationProvider {
  dispatch(message: OutboundMessage): Promise<{ delivered: boolean; providerId?: string }>;
}

/**
 * Safe default used until a real provider is configured. It records the intent
 * without sending, so development and tests never hit an external service.
 */
@Injectable()
export class LoggingNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger('NotificationProvider');

  async dispatch(message: OutboundMessage): Promise<{ delivered: boolean }> {
    this.logger.log(`[${message.channel}] → ${message.to}: ${message.subject ?? message.body}`);
    return { delivered: true };
  }
}
