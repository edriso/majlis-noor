import { describe, expect, it, vi } from 'vitest';
import { imageName, saveImage, type Browser } from './saveImage';

/* The browser stood in for: a share sheet that does what each case says,
   and the parts of a download (an address for the file, a link clicked,
   the address let go later) recorded rather than done. */
function stub(
  share?: {
    canShare: boolean;
    outcome: 'ok' | 'AbortError' | 'NotAllowedError';
  },
  touch = true,
) {
  const clicked: HTMLAnchorElement[] = [];
  const timers: (() => void)[] = [];
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
  const nav: Browser['navigator'] = share
    ? {
        canShare: vi.fn(() => share.canShare),
        share: vi.fn(() =>
          share.outcome === 'ok'
            ? Promise.resolve()
            : Promise.reject(new DOMException('no', share.outcome)),
        ),
      }
    : {};
  const b: Browser = {
    navigator: nav,
    touch,
    document,
    URL: {
      createObjectURL: vi.fn(() => 'blob:card'),
      revokeObjectURL: vi.fn(),
    },
    setTimeout: (run) => {
      timers.push(run);
    },
  };
  return { b, nav, clicked, timers, restore: () => click.mockRestore() };
}

const png = new Blob(['png'], { type: 'image/png' });

describe('saving the picture', () => {
  it('names the file for the day the sitting closed', () => {
    expect(imageName(new Date(2026, 9, 18, 19, 25).getTime())).toBe(
      'majlis-noor-2026-10-18.png',
    );
    expect(imageName(new Date(2027, 0, 5, 7, 0).getTime())).toBe(
      'majlis-noor-2027-01-05.png',
    );
  });

  it('hands it to the share sheet where the browser can share a file', async () => {
    const s = stub({ canShare: true, outcome: 'ok' });
    expect(await saveImage(png, 'majlis-noor-2026-10-18.png', s.b)).toBe(
      'shared',
    );
    const sent = vi.mocked(s.nav.share!).mock.calls[0][0]!;
    expect(sent.title).toBe('ختام المجلس');
    expect(sent.files).toHaveLength(1);
    const [file] = sent.files!;
    expect(file.name).toBe('majlis-noor-2026-10-18.png');
    expect(file.type).toBe('image/png');
    expect(vi.mocked(s.nav.canShare!).mock.calls[0][0]!.files).toEqual(
      sent.files,
    );
    expect(s.clicked).toHaveLength(0);
    s.restore();
  });

  it('takes a closed share sheet as no error, and downloads nothing', async () => {
    const s = stub({ canShare: true, outcome: 'AbortError' });
    expect(await saveImage(png, 'a.png', s.b)).toBe('cancelled');
    expect(s.clicked).toHaveLength(0);
    expect(s.b.URL.createObjectURL).not.toHaveBeenCalled();
    s.restore();
  });

  it('downloads it when sharing fails for any other reason', async () => {
    const s = stub({ canShare: true, outcome: 'NotAllowedError' });
    expect(await saveImage(png, 'a.png', s.b)).toBe('downloaded');
    expect(s.clicked).toHaveLength(1);
    s.restore();
  });

  it('downloads it on a computer, even one whose browser could share it', async () => {
    const s = stub({ canShare: true, outcome: 'ok' }, false);
    expect(await saveImage(png, 'a.png', s.b)).toBe('downloaded');
    expect(s.nav.share).not.toHaveBeenCalled();
    expect(s.clicked).toHaveLength(1);
    s.restore();
  });

  it('downloads it where files cannot be shared, and lets the address go after', async () => {
    // One at a time: each stands in for the same link's click.
    for (const share of [
      { canShare: false, outcome: 'ok' as const },
      undefined,
    ]) {
      const s = stub(share);
      expect(await saveImage(png, 'majlis-noor-2026-10-18.png', s.b)).toBe(
        'downloaded',
      );
      expect(s.nav.share ?? null).toSatisfy(
        (fn) => fn === null || vi.mocked(fn).mock.calls.length === 0,
      );
      const [a] = s.clicked;
      expect(a.download).toBe('majlis-noor-2026-10-18.png');
      expect(a.getAttribute('href')).toBe('blob:card');
      expect(a.isConnected).toBe(false);
      const file = vi.mocked(s.b.URL.createObjectURL).mock.calls[0][0] as File;
      expect(file.name).toBe('majlis-noor-2026-10-18.png');
      expect(s.b.URL.revokeObjectURL).not.toHaveBeenCalled();
      s.timers.forEach((run) => run());
      expect(s.b.URL.revokeObjectURL).toHaveBeenCalledWith('blob:card');
      s.restore();
    }
  });
});
