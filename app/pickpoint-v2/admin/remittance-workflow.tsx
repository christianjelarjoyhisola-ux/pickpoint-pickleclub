"use client";

import {useEffect, useRef, useState, type FormEvent} from "react";
import {ArrowUpRight, Check, Copy, FileCheck2, ReceiptText, RefreshCw, Upload, WalletCards, X} from "lucide-react";
import {formatPeso, type ManagementInsights, type RemittanceSummary} from "../../manage/management-adapter";
import s from "./remittance.module.css";

type Props = {
  insights: ManagementInsights | null;
  loading: boolean;
  error: string;
  copyAccount: () => void;
  run: (type: string, payload?: unknown, resourceId?: string) => Promise<boolean>;
  busy: (type: string, resourceId?: string) => boolean;
};
const statusLabels: Record<RemittanceSummary["status"], string> = {
  draft: "Ready to pay", due: "Payment due", submitted: "Receipt submitted",
  under_review: "Under review", settled: "Settled", rejected: "Action needed", void: "Voided",
};
function dateLabel(value: string | null, withTime = false) {
  if (!value) return "Not available";
  const date = new Date(value.length === 10 ? `${value}T12:00:00+08:00` : value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
    ...(withTime ? {hour: "numeric", minute: "2-digit", hour12: true} as const : {}),
  }).format(date);
}
function methodLabel(value?: string | null) {
  return value === "gcash" ? "GCash" : value === "maya" ? "Maya" : value === "bank_transfer" ? "Bank transfer" : "Payment account";
}
function canPay(item: RemittanceSummary) {
  return ["draft", "due", "rejected"].includes(item.status) && item.remainingBalance > 0;
}
function Period({item}: {item: RemittanceSummary}) {
  return <span>{dateLabel(item.periodStart)} – {dateLabel(item.periodEnd)}</span>;
}

function ReceiptDialog({item, run, busy, close}: {item: RemittanceSummary; run: Props["run"]; busy: boolean; close: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {element?.close(); document.body.style.overflow = overflow;};
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget), proof = data.get("proof");
    if (!(proof instanceof File) || !proof.size) {setError("Choose a payment receipt."); return;}
    if (proof.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(proof.type)) {
      setError("Choose a JPEG, PNG, or WebP image up to 8 MB."); return;
    }
    setError("");
    const ok = await run("remittance:submit", {
      remittanceId: item.id, amount: Number(data.get("amount")), paymentMethod: String(data.get("method")),
      paymentRef: String(data.get("reference")), note: String(data.get("note")),
      idempotencyKey: crypto.randomUUID(), proof,
    }, item.id);
    if (ok) close();
    else setError("Receipt could not be submitted. Check the details and try again.");
  }
  return <dialog ref={dialog} className={s.dialog} aria-labelledby="remittance-upload-title" onCancel={event => {event.preventDefault(); if (!busy) close();}}>
    <form onSubmit={submit}>
      <header><div><small>PAYMENT RECEIPT</small><h2 id="remittance-upload-title">Confirm your payment</h2><p>{item.reference}</p></div><button type="button" className={s.iconButton} disabled={busy} onClick={close} aria-label="Close payment upload"><X size={20}/></button></header>
      <div className={s.paymentAmount}><span>Cutoff balance</span><strong>{formatPeso(item.remainingBalance)}</strong></div>
      <div className={s.fields}>
        <label>Amount paid<input name="amount" type="number" min="0.01" step="0.01" defaultValue={item.remainingBalance.toFixed(2)} required/></label>
        <label>Payment method<select name="method" defaultValue="gcash"><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash deposit</option><option value="other">Other</option></select></label>
        <label className={s.full}>Transaction reference<input name="reference" minLength={4} maxLength={120} placeholder="Enter the payment reference" required/></label>
        <label className={`${s.full} ${s.fileField}`}>Upload receipt<input name="proof" type="file" accept="image/jpeg,image/png,image/webp" required/><span>JPEG, PNG, or WebP · up to 8 MB</span></label>
        <label className={s.full}>Note <span>(optional)</span><textarea name="note" maxLength={1000} placeholder="Add payment details"/></label>
      </div>
      {error && <p className={s.warning} role="alert">{error}</p>}
      <footer><button type="button" className={s.secondary} disabled={busy} onClick={close}>Cancel</button><button className={s.primary} disabled={busy}>{busy ? <RefreshCw className={s.spin} size={17}/> : <Upload size={17}/>} {busy ? "Uploading…" : "Submit receipt"}</button></footer>
    </form>
  </dialog>;
}

export function RemittanceWorkflow({insights, loading, error, copyAccount, run, busy}: Props) {
  const [paying, setPaying] = useState<RemittanceSummary | null>(null);
  const finance = insights?.finance;
  if (!finance) return <section className={s.notice} role="status">
    {loading ? <RefreshCw className={s.spin}/> : <WalletCards/>}
    <h2>{loading ? "Loading remittance…" : "Remittance unavailable"}</h2>
    <p>{loading ? "Checking your booking-fee ledger." : error || "Remittance details are not available for this account."}</p>
  </section>;
  const {dashboard, history} = finance;
  const {accumulated, paymentDestination: destination, openRemittances: open} = dashboard;
  const preparing = busy("remittance:prepare");
  const payable = open.filter(canPay);
  const readyAmount = payable.reduce((sum, item) => sum + item.remainingBalance, 0);
  const recent = history.filter(item => !open.some(active => active.id === item.id)).slice(0, 8);
  const cutoffReason = dashboard.role === "system_owner" ? "The court owner prepares and pays each cutoff." : !dashboard.canPrepare.allowed ? dashboard.canPrepare.reason : "Freeze this balance to prepare it for payment.";
  return <section className={s.root} aria-label="Remittance overview">
    {error && <p className={s.warning} role="alert">Showing the last loaded balance. {error}</p>}
    <div className={s.overview}>
      <article className={s.balance}>
        <div className={s.balanceTop}><span className={s.eyebrow}>ACCUMULATED BOOKING FEES</span><span className={s.liveBadge}><i/> Current period</span></div>
        <strong className={s.amount}>{formatPeso(accumulated.amountDue)}</strong>
        <p>Fees collected from paid bookings, awaiting cutoff.</p>
        <div className={s.period}><span>Period started</span><b>{accumulated.coverageStartAt ? dateLabel(accumulated.coverageStartAt, true) : "Awaiting first paid booking"}</b><span>Updated {dateLabel(dashboard.serverNow, true)} · PHT</span></div>
        <div className={s.cutoff}><div><span>Next cutoff date</span><b>{dateLabel(dashboard.nextDueOn)}</b></div>{dashboard.role === "court_owner" && <button className={s.primary} disabled={!dashboard.canPrepare.allowed || preparing || loading || !!error} onClick={() => {if (confirm(`Prepare a cutoff for ${formatPeso(accumulated.amountDue)}? New fees will begin a new period.`)) void run("remittance:prepare");}}>{preparing ? <RefreshCw size={17} className={s.spin}/> : <ArrowUpRight size={17}/>} {preparing ? "Preparing…" : "Prepare cutoff"}</button>}</div>
        <p className={s.cutoffHint}>{cutoffReason}</p>
      </article>
      <div className={s.stats}>
        <article><WalletCards size={21}/><div><span>Ready for payment</span><strong>{formatPeso(readyAmount)}</strong><small>{payable.length ? `${payable.length} cutoff${payable.length === 1 ? "" : "s"} awaiting payment` : "No cutoff awaiting payment"}</small></div></article>
        <article><ReceiptText size={21}/><div><span>Billable court-hours</span><strong>{accumulated.billableHours}</strong><small>{accumulated.bookingsCount} paid booking{accumulated.bookingsCount === 1 ? "" : "s"} in this period</small></div></article>
        <article><FileCheck2 size={21}/><div><span>Total settled</span><strong>{formatPeso(dashboard.settledTotal)}</strong><small>Verified remittance payments</small></div></article>
      </div>
    </div>
    <ol className={s.steps} aria-label="Remittance process"><li><b>1</b><span>Prepare cutoff<small>Freeze the period’s fees</small></span></li><li><b>2</b><span>Pay & upload<small>Send payment and receipt</small></span></li><li><b>3</b><span>Verification<small>Track payment status below</small></span></li></ol>
    <div className={s.columns}>
      <article className={s.panel}>
        <header><span className={s.eyebrow}>PAYMENT DESTINATION</span><h2>Where to send payment</h2><p>Use this account for your prepared cutoff.</p></header>
        {destination?.configured ? <>
          <div className={s.method}><WalletCards size={21}/><b>{methodLabel(destination.method)}</b></div>
          <dl className={s.account}><div><dt>Account name</dt><dd>{destination.accountName || "Not provided"}</dd></div><div><dt>Account number</dt><dd className={s.accountNumber}>{destination.accountReference || "Not provided"}</dd></div></dl>
          <button className={s.secondary} disabled={!destination.accountReference} onClick={copyAccount}><Copy size={16}/> Copy account number</button>
          {destination.instructions && <p className={s.instructions}>{destination.instructions}</p>}
          <p className={s.paymentNote}>Pay the balance shown on each cutoff, then upload its receipt. Fees still accumulating are separate.</p>
        </> : <div className={s.empty}><WalletCards/><h3>Payment account pending</h3><p>The platform payment destination has not been configured yet.</p></div>}
      </article>
      <article className={s.panel}>
        <header className={s.sectionHeader}><div><span className={s.eyebrow}>CURRENT PAYMENTS</span><h2>Open cutoffs</h2></div><span className={s.count}>{open.length}</span></header>
        {open.length ? <div className={s.cutoffList}>{open.map(item => <article key={item.id} className={s.cutoffCard}>
          <div className={s.recordTop}><b>{item.reference}</b><span className={s.status} data-status={item.status}>{statusLabels[item.status]}</span></div>
          <div className={s.recordPeriod}><Period item={item}/><span>Due {dateLabel(item.cycleDueOn)}</span></div>
          <div className={s.recordBottom}><div><small>Remaining balance</small><strong>{formatPeso(item.remainingBalance)}</strong></div>{canPay(item) && <button className={s.primary} disabled={!destination?.configured || loading || !!error} onClick={() => setPaying(item)}><Upload size={16}/> Upload receipt</button>}</div>
          {item.status === "rejected" && <p className={s.paymentNote}>The previous submission was rejected. Check the payment details before resubmitting.</p>}
          {["submitted", "under_review"].includes(item.status) && <p className={s.reviewNote}><Check size={15}/> Receipt received. Awaiting verification.</p>}
        </article>)}</div> : <div className={s.empty}><ReceiptText/><h3>No open cutoffs</h3><p>Once the court owner prepares a cutoff, its payment and receipt status will appear here.</p></div>}
      </article>
    </div>
    <article className={s.panel}>
      <header className={s.sectionHeader}><div><span className={s.eyebrow}>PAYMENT RECORDS</span><h2>Recent history</h2></div><span className={s.historyHint}>Latest {recent.length || "payments"}</span></header>
      {recent.length ? <div className={s.history}>{recent.map(item => <article key={item.id}><div><b>{item.reference}</b><Period item={item}/></div><span className={s.status} data-status={item.status}>{statusLabels[item.status]}</span><div className={s.historyAmount}><strong>{formatPeso(item.amountSettled)}</strong><small>Settled · {formatPeso(item.amountDue)} billed</small></div></article>)}</div> : <div className={s.historyEmpty}><FileCheck2 size={22}/><p>No completed remittances yet. Settled and closed cutoffs will appear here.</p></div>}
    </article>
    <p className={s.timezone}>All dates and times are in Philippine time (PHT).</p>
    {paying && <ReceiptDialog item={paying} run={run} busy={busy("remittance:submit", paying.id)} close={() => setPaying(null)}/>}
  </section>;
}
