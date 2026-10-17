'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export default function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const prior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      d.close();
      document.body.style.overflow = prior;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-inner">
        <button onClick={onClose} className="icon-button close-button" aria-label="Close dialog">
          <X size={20} />
        </button>
        {children}
      </div>
    </dialog>
  );
}
