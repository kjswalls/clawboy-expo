import React from 'react';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { FileAttachmentCard } from '../FileAttachmentCard';
import type { MessageFile } from '@/lib/openclaw/types';

// Mock useAuthedMedia so the component doesn't require a real ConnectionProvider
jest.mock('@/hooks/useAuthedMedia', () => ({
  useAuthedMedia: () => ({
    token: null,
    gatewayUrl: null,
    resolveAuthedSource: () => null,
  }),
}));

const pdfFile: MessageFile = {
  url: 'https://example.com/__openclaw__/assistant-media?source=%2Ftmp%2Freport.pdf',
  name: 'report.pdf',
  mimeType: 'application/pdf',
};

const audioFile: MessageFile = {
  url: 'https://example.com/__openclaw__/assistant-media?source=%2Ftmp%2Ftrack.mp3',
  name: 'track.mp3',
  mimeType: 'audio/mpeg',
};

const videoFile: MessageFile = {
  url: 'https://example.com/__openclaw__/assistant-media?source=%2Ftmp%2Fclip.mp4',
  name: 'clip.mp4',
  mimeType: 'video/mp4',
};

const unknownFile: MessageFile = {
  url: 'https://example.com/__openclaw__/assistant-media?source=%2Ftmp%2Fdata.bin',
  name: 'data.bin',
};

describe('FileAttachmentCard', () => {
  it('renders a PDF file', () => {
    const { toJSON } = renderWithProviders(<FileAttachmentCard file={pdfFile} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders an audio file', () => {
    const { toJSON } = renderWithProviders(<FileAttachmentCard file={audioFile} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders a video file', () => {
    const { toJSON } = renderWithProviders(<FileAttachmentCard file={videoFile} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders a file with no mimeType', () => {
    const { toJSON } = renderWithProviders(<FileAttachmentCard file={unknownFile} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('truncates very long filenames', () => {
    const longName: MessageFile = {
      url: 'https://example.com/file',
      name: 'this_is_a_very_long_file_name_that_should_be_truncated_at_some_point.pdf',
    };
    const { toJSON } = renderWithProviders(<FileAttachmentCard file={longName} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
