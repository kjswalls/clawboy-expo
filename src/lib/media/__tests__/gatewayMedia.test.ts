import {
  resolveMediaUrl,
  buildAuthedSource,
  buildAuthedSourceNoHeaders,
  sanitizeUrlForDisplay,
} from '../gatewayMedia';

const GATEWAY_WSS = 'wss://myserver.example.com/';
const GATEWAY_WS = 'ws://192.168.1.5:18789';
const EXPECTED_HOST_HTTPS = 'https://myserver.example.com';
const EXPECTED_HOST_HTTP = 'http://192.168.1.5:18789';
const MEDIA_ENDPOINT = '/__openclaw__/assistant-media';

describe('resolveMediaUrl', () => {
  describe('local absolute paths', () => {
    it('converts /tmp/... to assistant-media endpoint with wss host', () => {
      const result = resolveMediaUrl('/tmp/screenshot.png', GATEWAY_WSS);
      expect(result?.isGatewaySource).toBe(true);
      expect(result?.url).toBe(
        `${EXPECTED_HOST_HTTPS}${MEDIA_ENDPOINT}?source=${encodeURIComponent('/tmp/screenshot.png')}`
      );
    });

    it('converts /home/user/... to assistant-media endpoint with ws host', () => {
      const result = resolveMediaUrl('/home/user/doc.pdf', GATEWAY_WS);
      expect(result?.isGatewaySource).toBe(true);
      expect(result?.url).toBe(
        `${EXPECTED_HOST_HTTP}${MEDIA_ENDPOINT}?source=${encodeURIComponent('/home/user/doc.pdf')}`
      );
    });

    it('URL-encodes paths with spaces', () => {
      const result = resolveMediaUrl('/tmp/my file.png', GATEWAY_WSS);
      expect(result?.url).toContain('my%20file.png');
    });

    it('URL-encodes paths with unicode', () => {
      const result = resolveMediaUrl('/tmp/ünïcödé.jpg', GATEWAY_WSS);
      expect(result?.url).toContain('%C3%BC');
    });

    it('handles paths without a gateway URL (produces relative endpoint)', () => {
      const result = resolveMediaUrl('/tmp/file.png', undefined);
      expect(result?.isGatewaySource).toBe(true);
      expect(result?.url).toBe(`${MEDIA_ENDPOINT}?source=%2Ftmp%2Ffile.png`);
    });
  });

  describe('file:// URIs', () => {
    it('returns null for file:// URIs (device-local cache paths should render directly)', () => {
      // Device-local file:// paths (e.g. pasted/picked image in app cache) must
      // NOT be rewritten to the gateway endpoint — the server can't read them.
      // Callers (MediaEmbed) fall back to <Image source={{ uri: src }} /> instead.
      expect(resolveMediaUrl('file:///var/folders/abc/def.png', GATEWAY_WSS)).toBeNull();
    });

    it('returns null for iOS app cache paths', () => {
      expect(
        resolveMediaUrl(
          'file:///var/mobile/Containers/Data/Application/UUID/Library/Caches/ExponentExperienceData/foo.jpg',
          GATEWAY_WSS,
        ),
      ).toBeNull();
    });

    it('returns null for file:// when no gateway URL is provided', () => {
      expect(resolveMediaUrl('file:///tmp/local.png', undefined)).toBeNull();
    });
  });

  describe('tilde paths', () => {
    it('converts ~/... to assistant-media endpoint', () => {
      const result = resolveMediaUrl('~/Desktop/output.mp4', GATEWAY_WSS);
      expect(result?.isGatewaySource).toBe(true);
      expect(result?.url).toContain(`source=${encodeURIComponent('~/Desktop/output.mp4')}`);
    });
  });

  describe('data URIs', () => {
    it('passes data:image/ through unchanged', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
      const result = resolveMediaUrl(dataUri, GATEWAY_WSS);
      expect(result?.url).toBe(dataUri);
      expect(result?.isGatewaySource).toBe(false);
    });

    it('passes data:audio/ through unchanged', () => {
      const dataUri = 'data:audio/mp3;base64,AAAA';
      const result = resolveMediaUrl(dataUri, GATEWAY_WSS);
      expect(result?.url).toBe(dataUri);
      expect(result?.isGatewaySource).toBe(false);
    });
  });

  describe('https:// remote URLs', () => {
    it('passes https:// URLs through as-is', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = resolveMediaUrl(url, GATEWAY_WSS);
      expect(result?.url).toBe(url);
      expect(result?.isGatewaySource).toBe(false);
    });

    it('passes http:// URLs through as-is', () => {
      const url = 'http://192.168.1.10/media/foo.png';
      const result = resolveMediaUrl(url, GATEWAY_WSS);
      expect(result?.url).toBe(url);
    });
  });

  describe('unsafe schemes (rejected)', () => {
    it('rejects javascript: URLs', () => {
      expect(resolveMediaUrl('javascript:alert(1)', GATEWAY_WSS)).toBeNull();
    });

    it('rejects blob: URLs', () => {
      expect(resolveMediaUrl('blob:https://example.com/abc', GATEWAY_WSS)).toBeNull();
    });

    it('rejects ftp:// URLs', () => {
      expect(resolveMediaUrl('ftp://server.example.com/file', GATEWAY_WSS)).toBeNull();
    });

    it('rejects empty string', () => {
      expect(resolveMediaUrl('', GATEWAY_WSS)).toBeNull();
    });

    it('rejects null', () => {
      expect(resolveMediaUrl(null, GATEWAY_WSS)).toBeNull();
    });

    it('rejects undefined', () => {
      expect(resolveMediaUrl(undefined, GATEWAY_WSS)).toBeNull();
    });
  });
});

describe('buildAuthedSource', () => {
  it('includes Authorization: Bearer header when token is provided', () => {
    const src = buildAuthedSource('https://example.com/img.png', 'my-token');
    expect(src.headers.Authorization).toBe('Bearer my-token');
    expect(src.uri).toBe('https://example.com/img.png');
  });

  it('omits Authorization header when token is null', () => {
    const src = buildAuthedSource('https://example.com/img.png', null);
    expect(src.headers.Authorization).toBeUndefined();
    expect(Object.keys(src.headers)).toHaveLength(0);
  });

  it('omits Authorization header when token is undefined', () => {
    const src = buildAuthedSource('https://example.com/img.png', undefined);
    expect(src.headers.Authorization).toBeUndefined();
    expect(Object.keys(src.headers)).toHaveLength(0);
  });
});

describe('buildAuthedSourceNoHeaders', () => {
  it('appends ?token= to a URL without existing params', () => {
    const { uri } = buildAuthedSourceNoHeaders('https://host/__openclaw__/assistant-media?source=%2Ftmp%2Ff.png', 'tok');
    expect(uri).toContain('token=tok');
  });

  it('appends &token= when params already exist', () => {
    const { uri } = buildAuthedSourceNoHeaders('https://host/path?source=x', 'tok');
    expect(uri).toContain('&token=tok');
  });

  it('returns bare URL when token is null', () => {
    const { uri } = buildAuthedSourceNoHeaders('https://host/path', null);
    expect(uri).toBe('https://host/path');
    expect(uri).not.toContain('token');
  });
});

describe('sanitizeUrlForDisplay', () => {
  it('removes ?token= from URL', () => {
    const cleaned = sanitizeUrlForDisplay('https://host/path?token=secret&source=foo');
    expect(cleaned).not.toContain('secret');
    expect(cleaned).toContain('source=foo');
  });

  it('leaves URLs without token unchanged', () => {
    const url = 'https://host/path?source=foo';
    expect(sanitizeUrlForDisplay(url)).toBe(url);
  });
});
