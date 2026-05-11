import { describe, it, expect } from '@jest/globals';
import { deriveFallbackName } from '../deriveFallbackName';

describe('deriveFallbackName', () => {
  describe('URL with ?source= param', () => {
    it('returns the last segment of the source path', () => {
      const url = 'https://gw.example.com/media/proxy?source=%2Ffiles%2Fdocument.pdf';
      expect(deriveFallbackName(url)).toBe('document.pdf');
    });

    it('handles source path with multiple segments', () => {
      const url = 'https://gw.example.com/proxy?source=%2Fhome%2Fuser%2Fphoto.jpg';
      expect(deriveFallbackName(url)).toBe('photo.jpg');
    });

    it('returns just the filename when source is a bare filename', () => {
      const url = 'https://gw.example.com/proxy?source=image.png';
      expect(deriveFallbackName(url)).toBe('image.png');
    });
  });

  describe('URL without ?source= param', () => {
    it('falls back to last URL path segment', () => {
      const url = 'https://gw.example.com/files/report.docx';
      expect(deriveFallbackName(url)).toBe('report.docx');
    });

    it('returns the last path segment including query string when no source', () => {
      // deriveFallbackName uses src.split('/').pop() as fallback — does not strip query strings
      const url = 'https://gw.example.com/files/photo.jpg?token=abc123';
      expect(deriveFallbackName(url)).toBe('photo.jpg?token=abc123');
    });
  });

  describe('non-URL input', () => {
    it('returns last segment of a plain path', () => {
      expect(deriveFallbackName('/home/user/documents/report.pdf')).toBe('report.pdf');
    });

    it('returns the input unchanged when no slash is present', () => {
      expect(deriveFallbackName('justAFilename.txt')).toBe('justAFilename.txt');
    });

    it('returns input as-is when empty string', () => {
      expect(deriveFallbackName('')).toBe('');
    });
  });
});
