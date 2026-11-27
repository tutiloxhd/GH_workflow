import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { NEVER } from 'rxjs';
import { PushService } from './push.service';

describe('PushService', () => {
  it('termina la desconexión cuando el service worker está deshabilitado', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: SwPush, useValue: { isEnabled: false, subscription: NEVER } },
      ],
    });

    const service = TestBed.inject(PushService);
    await expect(service.unsubscribe()).resolves.toBeUndefined();
    expect(service.isSubscribed()).toBe(false);
  });
});
