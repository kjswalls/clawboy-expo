import React from 'react';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { InternalEventCard } from '../InternalEventCard';
import type { InternalContextEvent } from '@/lib/openclaw/utils';

const videoEvent: InternalContextEvent = {
  source: 'video_generation',
  type: 'video generation task',
  status: 'completed successfully',
  task: 'A cute dragon waving hello at the camera, digital animation style, bright and friendly',
  sessionId: '106fe79b-5ff6-4c77-902d-1bd0bb02883c',
  resultText: 'Generated 1 video with openai/sora-2.\nMEDIA:/path/to/video.mp4',
  cleanResultText: 'Generated 1 video with openai/sora-2.',
  videoUrl: '/__openclaw__/assistant-media?source=%2Fpath%2Fto%2Fvideo.mp4',
  raw: 'raw inner block',
};

const imageEvent: InternalContextEvent = {
  source: 'image_generation',
  type: 'image generation task',
  status: 'completed successfully',
  task: 'A sunset over the ocean',
  resultText: 'Generated 1 image.',
  raw: 'raw inner block',
};

const noDetailEvent: InternalContextEvent = {
  source: 'video_generation',
  status: 'completed successfully',
  raw: 'minimal',
};

const timestamp = new Date('2024-01-15T14:30:00Z');

describe('InternalEventCard', () => {
  it('renders a video event in collapsed state', () => {
    const { toJSON } = renderWithProviders(
      <InternalEventCard event={videoEvent} timestamp={timestamp} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders an image event', () => {
    const { toJSON } = renderWithProviders(
      <InternalEventCard event={imageEvent} timestamp={timestamp} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders an event with no task/result (no chevron / no expand)', () => {
    const { toJSON } = renderWithProviders(
      <InternalEventCard event={noDetailEvent} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders an event with unknown source (wrench icon fallback)', () => {
    const event: InternalContextEvent = {
      source: 'custom_agent',
      type: 'custom task',
      status: 'completed successfully',
      raw: '',
    };
    const { toJSON } = renderWithProviders(<InternalEventCard event={event} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders without timestamp', () => {
    const { toJSON } = renderWithProviders(<InternalEventCard event={videoEvent} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
