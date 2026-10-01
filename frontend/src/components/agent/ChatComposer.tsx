"use client";

import { useRef, useEffect, useState } from "react";
import type { KeyboardEvent } from "react";

type AttachedFile = {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
};

type ChatComposerProps = {
  value: string;
  disabled: boolean;
  showScenarios?: boolean;
  onChange: (value: string) => void;
  onSend: (attachments?: AttachedFile[]) => void;
};

export function ChatComposer({
  value,
  disabled,
  showScenarios: _showScenarios,
  onChange,
  onSend,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && (value.trim() || attachments.length > 0)) {
        handleSend();
      }
    }
  }

  function handleSend() {
    onSend(attachments);
    setAttachments([]);
  }

  function handleFileSelect(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            size: file.size,
            type: file.type,
            dataUrl: e.target?.result as string,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }

  const canSend = !disabled && (value.trim().length > 0 || attachments.length > 0);
  const charCount = value.length;

  return (
    <div
      className={`composer-wrap ${dragOver ? "composer-dragover" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
{/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="attachments-row">
          {attachments.map((file, i) => (
            <div key={i} className="attachment-chip">
              <span className="attachment-icon">
                {file.type.includes("pdf") ? "📄" : file.type.includes("image") ? "🖼️" : "📎"}
              </span>
              <span className="attachment-name" title={file.name}>
                {file.name.length > 20 ? file.name.slice(0, 18) + "…" : file.name}
              </span>
              <span className="attachment-size">
                {(file.size / 1024).toFixed(0)}KB
              </span>
              <button
                type="button"
                className="attachment-remove"
                onClick={() => removeAttachment(i)}
                aria-label={`Remove ${file.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {dragOver && (
        <div className="drop-overlay">
          <p>Drop files here</p>
        </div>
      )}

      <div className="composer-inner">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          accept=".pdf,.txt,.doc,.docx,.png,.jpg,.jpeg"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          aria-label="Attach files"
        />

        {/* Attach button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="attach-btn"
          title="Attach a file (PDF, image, doc)"
          aria-label="Attach file"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        {/* Textarea */}
        <label className="sr-only" htmlFor="agent-message">Type a message</label>
        <textarea
          id="agent-message"
          ref={textareaRef}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
          className="composer-textarea"
        />

        {/* Char count */}
        {charCount > 100 && (
          <span className={`char-count ${charCount > 1000 ? "char-count-warn" : ""}`}>
            {charCount}
          </span>
        )}

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="send-btn"
          title="Send message (Enter)"
          aria-label="Send message"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      <p className="composer-hint">
        Enter to send · Shift+Enter for new line · Drag &amp; drop files to attach
      </p>
    </div>
  );
}
