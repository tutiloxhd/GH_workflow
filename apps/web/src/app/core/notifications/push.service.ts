import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';

interface PushConfig {
  readonly isEnabled: boolean;
  readonly publicKey: string | null;
}

@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly http = inject(HttpClient);
  private readonly swPush = inject(SwPush);
  private readonly subscribed = signal(false);
  private readonly available = signal(false);

  readonly isSubscribed = this.subscribed.asReadonly();
  readonly isAvailable = this.available.asReadonly();

  async refresh(): Promise<void> {
    if (!this.swPush.isEnabled || !('Notification' in window)) {
      this.available.set(false);
      return;
    }
    const config = await firstValueFrom(this.http.get<PushConfig>('/api/push/config'));
    this.available.set(config.isEnabled && Boolean(config.publicKey));
    if (!config.isEnabled) {
      this.subscribed.set(false);
      return;
    }
    const subscription = await firstValueFrom(this.swPush.subscription);
    if (!subscription) {
      this.subscribed.set(false);
      return;
    }
    const response = await firstValueFrom(this.http.post<{ isSubscribed: boolean }>(
      '/api/push/subscriptions/status', { endpoint: subscription.endpoint },
    ));
    this.subscribed.set(response.isSubscribed);
  }

  async subscribe(): Promise<void> {
    const config = await firstValueFrom(this.http.get<PushConfig>('/api/push/config'));
    if (!config.isEnabled || !config.publicKey) throw new Error('PushNotConfigured');
    const existing = await firstValueFrom(this.swPush.subscription);
    if (existing && !this.subscribed()) await this.swPush.unsubscribe();
    const subscription = await this.swPush.requestSubscription({ serverPublicKey: config.publicKey });
    const keys = subscription.toJSON().keys;
    if (!keys?.['p256dh'] || !keys['auth']) throw new Error('PushKeysUnavailable');
    await firstValueFrom(this.http.post('/api/push/subscriptions', {
      endpoint: subscription.endpoint,
      keys: { p256dh: keys['p256dh'], auth: keys['auth'] },
    }));
    this.subscribed.set(true);
  }

  async unsubscribe(): Promise<void> {
    const subscription = await firstValueFrom(this.swPush.subscription);
    if (!subscription) {
      this.subscribed.set(false);
      return;
    }
    await firstValueFrom(this.http.request('DELETE', '/api/push/subscriptions', {
      body: { endpoint: subscription.endpoint },
    }));
    await this.swPush.unsubscribe();
    this.subscribed.set(false);
  }
}
