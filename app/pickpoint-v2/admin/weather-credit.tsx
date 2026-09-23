"use client";

import { useEffect, useState } from "react";
import { Check, CloudRain, Copy } from "lucide-react";
import { manageWeatherCredit, type WeatherCreditRecord } from "../../lib/platform/client";
import s from "./admin.module.css";

const formatPeso = (amount: number) => new Intl.NumberFormat("en-PH", {
  style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(amount);

export function WeatherCredit({ bookingId }: { bookingId: string }) {
  const [record, setRecord] = useState<WeatherCreditRecord | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("rain");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    manageWeatherCredit(bookingId, "get").then(result => {
      if (active) { setRecord(result); setAmount(String(result.maximumAmount)); }
    }).catch(() => { if (active) setError("Weather credits are unavailable. Please reopen this booking to try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookingId]);
  async function issue(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { setRecord(await manageWeatherCredit(bookingId, record?.credit ? "email" : "issue", Number(amount), reason)); }
    catch (error) { setError(error instanceof Error ? error.message : "Credit could not be issued."); }
    finally { setBusy(false); }
  }
  const credit = record?.credit;
  return <section className={s.weatherCredit} aria-labelledby="weather-credit-title">
    <div className={s.weatherCreditHeading}><CloudRain aria-hidden="true"/><div><h3 id="weather-credit-title">A rain check, made easy.</h3><p>Weather credit for another day on court.</p></div></div>
    {loading ? <p role="status">Checking weather credit…</p> : credit ? <form onSubmit={issue}>
      <div className={s.weatherCreditBalance}><strong>{formatPeso(credit.balance)}</strong><span>available · {formatPeso(credit.amount)} issued</span></div>
      <div className={s.weatherCreditCode}><code>{credit.code}</code><button type="button" aria-label="Copy weather credit code" onClick={async () => { try { await navigator.clipboard.writeText(credit.code); setCopied(true); } catch { setError("Select the code above to copy it."); } }}>{copied ? <Check/> : <Copy/>}</button></div>
      <p>{credit.emailSent ? `Email sent to ${record.email}.` : `Credit saved for ${record.email}. Email delivery is pending.`}</p>
      {!credit.emailSent && <button className={s.primary} disabled={busy}>{busy ? "Sending…" : "Retry email"}</button>}
      <small>Unused credit stays on this code. The original booking remains in your records.</small>
    </form> : record?.eligible ? <form onSubmit={issue}>
      <p>Send to <strong>{record.email}</strong>. Choose the full court charges or just the unused portion.</p>
      <div className={s.weatherCreditFields}><label>Credit amount · PHP<input type="number" min="0.01" max={record.maximumAmount} step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} disabled={busy}/></label><label>Weather reason<select value={reason} onChange={event => setReason(event.target.value)} disabled={busy}><option value="rain">Rain</option><option value="wet_court">Wet court</option><option value="unsafe_weather">Unsafe weather</option></select></label></div>
      <small>Up to {formatPeso(record.maximumAmount)}. Separate booking fees are excluded. One credit per booking; issuing it does not cancel the reservation.</small>
      <button className={s.primary} disabled={busy || !(Number(amount) > 0)}>{busy ? "Issuing credit…" : "Issue & email credit"}</button>
    </form> : record ? <p>A paid booking with a guest email is needed to issue credit.</p> : null}
    {error && <p role="alert" className={s.weatherCreditError}>{error}</p>}
  </section>;
}
