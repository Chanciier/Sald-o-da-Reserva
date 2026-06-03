'use client';

import { useCallback, useRef, useState } from 'react';
import type { ImageData } from '@/types/image';
import { deleteImage, type UploadFolder, uploadImages } from '@/lib/upload';

interface ImageUploadProps {
  folder: UploadFolder;
  token: string;
  value?: ImageData[];
  onChange?: (images: ImageData[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_MB = 10;
const MAX_BYTES = MAX_MB * 1024 * 1024;

export function ImageUpload({
  folder,
  token,
  value = [],
  onChange,
  maxFiles = 10,
  disabled = false,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (!files.length) return;

      const oversized = files.filter((f) => f.size > MAX_BYTES);
      if (oversized.length) {
        setError(`${oversized.length} arquivo(s) excedem ${MAX_MB}MB.`);
        return;
      }

      const slots = maxFiles - value.length;
      if (slots <= 0) {
        setError(`Limite de ${maxFiles} imagem(ns) atingido.`);
        return;
      }

      setError(null);
      setUploading(true);
      try {
        const uploaded = await uploadImages(files.slice(0, slots), folder, token);
        onChange?.([...value, ...uploaded]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [folder, token, value, onChange, maxFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (!disabled) handleFiles(e.dataTransfer.files);
    },
    [disabled, handleFiles],
  );

  const handleRemove = useCallback(
    async (img: ImageData) => {
      const filename = img.key.split('/').pop()!;
      try {
        await deleteImage(img.folder, filename, token);
        onChange?.(value.filter((i) => i.id !== img.id));
      } catch {
        setError('Erro ao excluir imagem.');
      }
    },
    [token, value, onChange],
  );

  const isDisabled = disabled || uploading;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-disabled={isDisabled}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDisabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isDisabled && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !isDisabled && inputRef.current?.click()}
        className={[
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 transition-colors select-none',
          dragging ? 'border-primary bg-primary/5' : 'border-border',
          isDisabled
            ? 'cursor-not-allowed opacity-50'
            : 'hover:border-primary/60 hover:bg-muted/40',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          disabled={isDisabled}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />

        {uploading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            Enviando…
          </div>
        ) : (
          <>
            <svg
              className="h-8 w-8 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-sm text-muted-foreground">
              Arraste aqui ou{' '}
              <span className="font-medium text-primary">clique para selecionar</span>
            </p>
            <p className="text-xs text-muted-foreground">
              JPG, PNG, WebP, GIF · Máx. {MAX_MB} MB · até {maxFiles} arquivo(s)
            </p>
          </>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {value.map((img) => (
            <div
              key={img.id}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
            >
              <img src={img.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemove(img)}
                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remover imagem"
              >
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-1 py-0.5 text-center text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {(img.size / 1024).toFixed(0)} KB
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
