export interface InputAttachment {
  id: string;
  name: string;
  type: 'image' | 'file';
  preview?: string;
}
