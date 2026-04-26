import React from 'react';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { MediaFallbackCard, isAgentGeneratedAllowlistMiss } from '../MediaFallbackCard';
import type { MediaDiagnosis } from '@/lib/media/diagnoseMediaFailure';

describe('MediaFallbackCard', () => {
  it('renders an image fallback card', () => {
    const { toJSON } = renderWithProviders(
      <MediaFallbackCard kind="image" name="photo---uuid.jpg" />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders a video fallback card', () => {
    const { toJSON } = renderWithProviders(
      <MediaFallbackCard kind="video" name="clip---uuid.mp4" />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders an audio fallback card', () => {
    const { toJSON } = renderWithProviders(
      <MediaFallbackCard kind="audio" name="track.mp3" />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders a file fallback card', () => {
    const { toJSON } = renderWithProviders(
      <MediaFallbackCard kind="file" name="archive.zip" />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('truncates long filenames', () => {
    const longName = 'a'.repeat(60) + '.jpg';
    const { toJSON } = renderWithProviders(
      <MediaFallbackCard kind="image" name={longName} />,
    );
    const json = JSON.stringify(toJSON());
    // The 64-char name should be truncated: 37 chars + ellipsis
    expect(json).toContain('…');
    expect(json).not.toContain(longName);
  });

  it('shows a specific subtitle when reason is html', () => {
    const { getByText } = renderWithProviders(
      <MediaFallbackCard kind="image" name="photo.jpg" reason="html" />,
    );
    expect(getByText("Server didn't return this file")).toBeTruthy();
  });

  it('shows a specific subtitle when reason is auth-failed', () => {
    const { getByText } = renderWithProviders(
      <MediaFallbackCard kind="video" name="clip.mp4" reason="auth-failed" />,
    );
    expect(getByText('Not authorized to load this')).toBeTruthy();
  });

  it('shows a specific subtitle when reason is not-found', () => {
    const { getByText } = renderWithProviders(
      <MediaFallbackCard kind="audio" name="track.mp3" reason="not-found" />,
    );
    expect(getByText("File isn't on the server")).toBeTruthy();
  });

  it('falls back to generic subtitle when reason is other', () => {
    const { getByText } = renderWithProviders(
      <MediaFallbackCard kind="image" name="photo.jpg" reason="other" />,
    );
    expect(getByText('Image unavailable')).toBeTruthy();
  });
});

describe('isAgentGeneratedAllowlistMiss', () => {
  const makeAssistantMediaDiagnosis = (source: string): MediaDiagnosis => ({
    reason: 'not-found',
    httpStatus: 404,
    httpStatusText: 'Not Found',
    contentType: 'text/plain; charset=utf-8',
    contentLength: '9',
    snippet: 'Not Found',
    sanitizedUrl: `https://gateway.example.com/__openclaw__/assistant-media?source=${encodeURIComponent(source)}`,
  });

  it('returns true for /tmp/... path on assistant-media with 404', () => {
    expect(isAgentGeneratedAllowlistMiss(makeAssistantMediaDiagnosis('/tmp/guma-test.mp3'))).toBe(true);
  });

  it('returns true for ~/... tilde paths', () => {
    expect(isAgentGeneratedAllowlistMiss(makeAssistantMediaDiagnosis('~/output/audio.wav'))).toBe(true);
  });

  it('returns true for file:// paths', () => {
    expect(isAgentGeneratedAllowlistMiss(makeAssistantMediaDiagnosis('file:///var/tmp/sound.mp3'))).toBe(true);
  });

  it('returns false when URL is not an assistant-media endpoint (cross-client 404)', () => {
    const diagnosis: MediaDiagnosis = {
      reason: 'not-found',
      httpStatus: 404,
      sanitizedUrl: 'https://cdn.example.com/media/photo.jpg',
    };
    expect(isAgentGeneratedAllowlistMiss(diagnosis)).toBe(false);
  });

  it('returns false when HTTP status is not 404', () => {
    const d = makeAssistantMediaDiagnosis('/tmp/file.png');
    expect(isAgentGeneratedAllowlistMiss({ ...d, httpStatus: 403, reason: 'auth-failed' })).toBe(false);
  });

  it('returns false when source param is absent', () => {
    const diagnosis: MediaDiagnosis = {
      reason: 'not-found',
      httpStatus: 404,
      sanitizedUrl: 'https://gateway.example.com/__openclaw__/assistant-media',
    };
    expect(isAgentGeneratedAllowlistMiss(diagnosis)).toBe(false);
  });

  it('returns false when source is an http URL (not a local path)', () => {
    expect(isAgentGeneratedAllowlistMiss(makeAssistantMediaDiagnosis('https://cdn.example.com/img.png'))).toBe(false);
  });

  it('returns false for undefined diagnosis', () => {
    expect(isAgentGeneratedAllowlistMiss(undefined)).toBe(false);
  });
});

describe('MediaFallbackCard agent-path-blocked rendering', () => {
  const tmpDiagnosis: MediaDiagnosis = {
    reason: 'not-found',
    httpStatus: 404,
    httpStatusText: 'Not Found',
    contentType: 'text/plain; charset=utf-8',
    contentLength: '9',
    snippet: 'Not Found',
    sanitizedUrl: 'https://gateway.example.com/__openclaw__/assistant-media?source=%2Ftmp%2Fguma-wave.jpg',
  };

  const crossClientDiagnosis: MediaDiagnosis = {
    reason: 'not-found',
    httpStatus: 404,
    sanitizedUrl: 'https://cdn.example.com/uploads/photo.jpg',
  };

  it('shows "Path not allowed by gateway" subtitle for /tmp allowlist miss', () => {
    const { getByText } = renderWithProviders(
      <MediaFallbackCard kind="image" name="guma-wave.jpg" diagnosis={tmpDiagnosis} />,
    );
    expect(getByText('Path not allowed by gateway')).toBeTruthy();
  });

  it('shows "File isn\'t on the server" subtitle for cross-client 404', () => {
    const { getByText } = renderWithProviders(
      <MediaFallbackCard kind="image" name="photo.jpg" diagnosis={crossClientDiagnosis} />,
    );
    expect(getByText("File isn't on the server")).toBeTruthy();
  });

  it('renders a snapshot for the agent-path-blocked case', () => {
    const { toJSON } = renderWithProviders(
      <MediaFallbackCard kind="audio" name="guma-test.mp3" diagnosis={tmpDiagnosis} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders a snapshot for the cross-client 404 case', () => {
    const { toJSON } = renderWithProviders(
      <MediaFallbackCard kind="image" name="photo.jpg" diagnosis={crossClientDiagnosis} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
