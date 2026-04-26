export type InputAttachmentKind = 'image' | 'file' | 'video' | 'audio';

export interface InputAttachment {
  id: string;
  name: string;
  type: InputAttachmentKind;
  /** Local file URI (`file://`, `content://`) used when sending. */
  uri: string;
  mimeType?: string;
  /** Thumbnail / gallery preview (often same as `uri` for photos). */
  preview?: string;
  sizeBytes?: number;
}
