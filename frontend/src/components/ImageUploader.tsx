import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { getAccessToken, BACKEND_URL } from '../services/api';
import './ImageUploader.css';

interface ImageUploaderProps {
  /** Current URL value (e.g. /uploads/abc.jpg or empty string) */
  value: string;
  /** Called with the new /uploads/... URL after a successful upload, or with the typed URL */
  onChange: (url: string) => void;
  label?: string;
  placeholder?: string;
  /** If true, shows a round avatar preview (for profile pics) */
  rounded?: boolean;
}

export default function ImageUploader({
  value,
  onChange,
  label,
  placeholder = '/uploads/your-image.jpg',
  rounded = false,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Upload helper ── */
  const uploadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Only image files are supported.');
      return;
    }
    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Use XHR so we can track progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${BACKEND_URL}/api/v1/upload`);
        xhr.withCredentials = true; // send auth cookie

        const token = getAccessToken();
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };

        xhr.onload = () => {
          if (xhr.status === 200 || xhr.status === 201) {
            try {
              const data = JSON.parse(xhr.responseText);
              onChange(data.url);
              setProgress(100);
              resolve();
            } catch {
              reject(new Error('Invalid response from server'));
            }
          } else {
            try {
              const data = JSON.parse(xhr.responseText);
              reject(new Error(data.error || `Upload failed (${xhr.status})`));
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(formData);
      });
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  /* ── Drag & Drop ── */
  const handleDragOver = (e: DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  /* ── File input ── */
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = ''; // reset so same file can be re-selected
  };

  const previewSrc = value
    ? (value.startsWith('/uploads/') || value.startsWith('http') ? value : value)
    : null;

  return (
    <div className="img-uploader">
      {label && <label className="img-uploader__label">{label}</label>}

      {/* Drop zone */}
      <div
        className={[
          'img-uploader__zone',
          rounded ? 'img-uploader__zone--round' : '',
          dragOver ? 'img-uploader__zone--drag' : '',
          uploading ? 'img-uploader__zone--busy' : '',
        ].join(' ')}
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        title="Click or drag an image to upload"
      >
        {/* Preview */}
        {previewSrc && !uploading && (
          <>
            <img src={previewSrc} alt="Preview" className={`img-uploader__preview${rounded ? ' img-uploader__preview--round' : ''}`} />
            <div className="img-uploader__overlay">
              <Upload size={18} />
              <span>Change</span>
            </div>
          </>
        )}

        {/* Empty state */}
        {!previewSrc && !uploading && (
          <div className="img-uploader__empty">
            <ImageIcon size={28} className="img-uploader__icon" />
            <p className="img-uploader__hint">Click or drop image</p>
            <p className="img-uploader__sub">JPG · PNG · GIF · WebP · Max 10 MB</p>
          </div>
        )}

        {/* Uploading state */}
        {uploading && (
          <div className="img-uploader__progress-wrap">
            <div className="img-uploader__spinner" />
            <p className="img-uploader__progress-label">{progress}%</p>
            <div className="img-uploader__progress-bar">
              <div className="img-uploader__progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Manual URL input + clear */}
      <div className="img-uploader__url-row">
        <input
          type="text"
          className="img-uploader__url-input"
          value={value}
          onChange={e => { setError(null); onChange(e.target.value); }}
          placeholder={placeholder}
          disabled={uploading}
        />
        {value && !uploading && (
          <button
            type="button"
            className="img-uploader__clear"
            onClick={() => { onChange(''); setError(null); setProgress(0); }}
            title="Clear"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {error && <p className="img-uploader__error">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}
