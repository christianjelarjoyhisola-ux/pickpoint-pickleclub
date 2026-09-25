"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { X } from "lucide-react";

export function PaymentQr({ src, name }: { src: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef<string | null>(null);
  function restoreScroll() {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  }
  useEffect(() => () => {
    if (previousOverflow.current !== null) document.body.style.overflow = previousOverflow.current;
  }, []);
  function open() {
    if (!dialog.current || dialog.current.open) return;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current.showModal();
  }
  return <div className="pp-payment-qr">
    <strong>Scan to pay with {name}</strong>
    <button type="button" className="pp-qr-thumbnail" onClick={open} aria-label={`Enlarge ${name} QR code`} aria-haspopup="dialog">
      <Image src={src} width={260} height={260} unoptimized alt={`${name} payment QR code`} />
    </button>
    <button type="button" className="pp-qr-enlarge" onClick={open} aria-haspopup="dialog">Enlarge QR</button>
    <small>Check the recipient and amount in your payment app before paying.</small>
    <dialog ref={dialog} className="pp-qr-dialog" aria-label={`${name} payment QR code`} onClose={restoreScroll} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
    }}>
      <header><strong>{name} payment QR</strong><button type="button" onClick={() => dialog.current?.close()} aria-label="Close QR image"><X aria-hidden="true" /> Close</button></header>
      <Image src={src} width={900} height={900} unoptimized alt={`Full ${name} payment QR code`} />
      <p>Take a screenshot, then close to return to your payment.</p>
    </dialog>
  </div>;
}
