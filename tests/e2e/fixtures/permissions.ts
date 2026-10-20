import { Page, BrowserContext } from '@playwright/test';

export async function denyMicrophone(context: BrowserContext) {
  await context.clearPermissions();
  await context.grantPermissions([], { origin: 'http://localhost:3000' });
}

export async function grantMicrophone(context: BrowserContext) {
  await context.grantPermissions(['microphone'], { origin: 'http://localhost:3000' });
}

export async function blockMicrophoneViaScript(page: Page) {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    // @ts-ignore
    navigator.mediaDevices.getUserMedia = async function (constraints?: MediaStreamConstraints) {
      if (constraints && (constraints as any).audio) {
        const err: any = new DOMException('Permission denied', 'NotAllowedError');
        throw err;
      }
      return original(constraints);
    };
  });
}
