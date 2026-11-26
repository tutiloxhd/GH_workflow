declare module 'web-push' {
  export interface PushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }
  export function sendNotification(
    subscription: PushSubscription,
    payload: string,
    options: {
      vapidDetails: { subject: string; publicKey: string; privateKey: string };
      TTL: number;
      timeout: number;
    },
  ): Promise<{ statusCode: number }>;
}
