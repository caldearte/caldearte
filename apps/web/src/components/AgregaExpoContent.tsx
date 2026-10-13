"use client";

import { useRef, useState, type FormEvent } from "react";
import { esCL } from "@/i18n/es-CL";
import { compressImage } from "@/lib/compressImage";
import Footer from "./Footer";
import DrawerShell from "./DrawerShell";
import ContactPanel from "./ContactPanel";
import SiteWordmark from "@/components/SiteWordmark";

interface Comuna {
  id: string;
  name: string;
  adminRegionName: string | null;
}

type Status = "idle" | "compressing" | "sending" | "approved" | "rejected" | "rate_limited" | "error";

// Same field language as the home's newsletter form (NewsletterSection):
// underlined, Lato, on the panel's gray-blue.
const INPUT_CLASS =
  "w-full bg-transparent border-b-4 border-text-primary rounded-input px-[8px] py-[10px] md:py-[12px] font-lato font-semibold text-[16px] md:text-[18px] text-text-primary placeholder:text-text-primary/60 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3d373d] focus-visible:outline-offset-2";
const LABEL_CLASS = "font-geist font-semibold text-[12px] tracking-[1.5px] uppercase text-text-primary/80";
const PILL_BUTTON =
  "cursor-pointer rounded-[75px] border-4 border-text-primary font-lato font-black text-[20px] md:text-[24px] px-[20px] py-[8px] transition-colors disabled:cursor-default disabled:opacity-60";

const STEP_COUNT = esCL.agregaExpo.steps.length;

function findComunaByName(comunas: Comuna[], name: string): Comuna | undefined {
  const normalized = name.trim().toLowerCase();
  return comunas.find((c) => c.name.trim().toLowerCase() === normalized);
}

// "Agrega tu expo" as four short steps (2026-10-13, Daniel: simpler and
// faster to fill) in the newsletter form's look — gray-blue panel, Lato
// Black headline with one magenta word, underlined fields, round buttons.
// One <form> holds every step (the hidden ones stay mounted), so the final
// submit sends the same FormData to /api/submit-event as before; each
// step is checked before moving on.
export default function AgregaExpoContent({ comunas, galleries }: { comunas: Comuna[]; galleries: string[] }) {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [resultMessage, setResultMessage] = useState<string>("");
  const [formError, setFormError] = useState<string>("");
  const [image, setImage] = useState<File | null>(null);
  const [artists, setArtists] = useState<string[]>([""]);
  const [contactOpen, setContactOpen] = useState(false);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  async function handleImageChange(file: File | null) {
    if (!file) {
      setImage(null);
      return;
    }
    setFormError("");
    setStatus("compressing");
    try {
      setImage(await compressImage(file));
    } catch {
      setImage(file);
    }
    setStatus("idle");
  }

  // Native validation for the step's own fields, then the checks the
  // browser can't do (a comuna from the list, at least one artist, an
  // image).
  function validateStep(i: number, form: HTMLFormElement): boolean {
    setFormError("");
    const container = stepRefs.current[i];
    if (container) {
      for (const field of container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
        if (field.type === "file" || field.type === "hidden") continue;
        if (!field.checkValidity()) {
          field.reportValidity();
          return false;
        }
      }
    }
    if (i === 0 && artists.every((a) => !a.trim())) {
      setFormError(esCL.agregaExpo.noArtist);
      return false;
    }
    if (i === 1 && !findComunaByName(comunas, (new FormData(form).get("comunaName") as string) ?? "")) {
      setFormError(esCL.agregaExpo.comunaNotInList);
      return false;
    }
    if (i === 2 && !image) {
      setFormError(esCL.agregaExpo.noImage);
      return false;
    }
    return true;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!validateStep(step, form)) return;
    // Enter in a field, or "Siguiente": next step until the last one.
    if (step < STEP_COUNT - 1) {
      setStep(step + 1);
      return;
    }
    if (!image) return;

    const formData = new FormData(form);
    const comuna = findComunaByName(comunas, (formData.get("comunaName") as string) ?? "")!;
    formData.set("comunaName", comuna.name);
    formData.set("regionId", comuna.id);
    formData.set("artist", artists.map((a) => a.trim()).filter(Boolean).join(", "));
    formData.delete("images");
    formData.append("images", image);

    setStatus("sending");
    try {
      const res = await fetch("/api/submit-event", { method: "POST", body: formData });
      const data = (await res.json()) as { status: Status; message?: string };
      setStatus(data.status);
      setResultMessage(data.message ?? "");
      if (data.status === "approved") {
        form.reset();
        setImage(null);
        setArtists([""]);
        setStep(0);
      }
    } catch {
      setStatus("error");
    }
  }

  const busy = status === "sending" || status === "compressing";
  const done = status === "approved" || status === "rejected" || status === "rate_limited" || status === "error";
  const heading = esCL.agregaExpo.steps[step];

  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <SiteWordmark />

      <section className="mt-[40px] md:mt-[60px] max-w-[720px] bg-text-placeholder p-[28px] md:p-[48px] flex flex-col gap-[28px] md:gap-[36px]">
        <div className="flex flex-col gap-[14px] md:gap-[16px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- static icon, same as the home's "¿Tienes un espacio?" */}
          <img src="/icons/framed-art.svg" alt="" width={64} height={64} className="md:w-[80px] md:h-[80px]" />
          <p className="font-geist font-semibold text-[13px] tracking-[2px] uppercase text-text-primary">
            {done ? esCL.agregaExpo.title : `${esCL.agregaExpo.title} · ${esCL.agregaExpo.stepOf(step + 1, STEP_COUNT)}`}
          </p>
          {/* Progress: one segment per step, magenta up to the current one. */}
          {!done && (
            <div className="flex gap-[6px]" aria-hidden="true">
              {esCL.agregaExpo.steps.map((_, i) => (
                <span key={i} className={`h-[6px] flex-1 rounded-full ${i <= step ? "bg-brand-magenta" : "bg-text-primary/20"}`} />
              ))}
            </div>
          )}
          <h1 className="font-lato font-black leading-none text-text-primary text-[40px] md:text-[56px]">
            {done ? (
              <>
                {status === "approved" && <span className="text-brand-magenta">{esCL.agregaExpo.approvedPrefix.toUpperCase()}</span>}
                {status === "rejected" && esCL.agregaExpo.rejectedPrefix.toUpperCase()}
                {status === "rate_limited" && esCL.agregaExpo.rateLimitedPrefix.toUpperCase()}
                {status === "error" && esCL.agregaExpo.errorTitle}
              </>
            ) : (
              <>
                {heading.start}
                <span className="text-brand-magenta">{heading.highlight}</span>
                {heading.end}
              </>
            )}
          </h1>
          {!done && step === 0 && <p className="font-lato font-semibold text-[16px] md:text-[18px] leading-[1.4] text-text-primary">{esCL.agregaExpo.intro}</p>}
        </div>

        {done ? (
          <div className="flex flex-col gap-[20px]">
            <p className="font-lato font-semibold text-[16px] md:text-[18px] leading-[1.4] text-text-primary">
              {status === "error" ? esCL.agregaExpo.error : resultMessage}
            </p>
            <div>
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setResultMessage("");
                }}
                className={`${PILL_BUTTON} bg-transparent text-text-primary hover:bg-text-primary hover:text-text-placeholder`}
              >
                {status === "approved" ? esCL.agregaExpo.title.toUpperCase() : esCL.agregaExpo.tryAgain.toUpperCase()}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-[28px] md:gap-[32px]">
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

            {/* Step 1 — the show */}
            <div ref={(el) => { stepRefs.current[0] = el; }} className={step === 0 ? "flex flex-col gap-[20px]" : "hidden"}>
              <label className="flex flex-col gap-[4px]">
                <span className={LABEL_CLASS}>{esCL.agregaExpo.titleLabel}</span>
                <input name="title" type="text" required className={INPUT_CLASS} />
              </label>
              <div className="flex flex-col gap-[4px]">
                <span className={LABEL_CLASS}>{esCL.agregaExpo.artistLabel}</span>
                {artists.map((value, i) => (
                  <input
                    key={i}
                    type="text"
                    aria-label={esCL.agregaExpo.artistLabel}
                    value={value}
                    onChange={(e) => setArtists((prev) => prev.map((a, idx) => (idx === i ? e.target.value : a)))}
                    className={INPUT_CLASS}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setArtists((prev) => [...prev, ""])}
                  className="self-start mt-[6px] underline font-geist text-[14px] text-text-primary cursor-pointer"
                >
                  {esCL.agregaExpo.addArtist}
                </button>
              </div>
            </div>

            {/* Step 2 — where and when */}
            <div ref={(el) => { stepRefs.current[1] = el; }} className={step === 1 ? "flex flex-col gap-[20px]" : "hidden"}>
              <label className="flex flex-col gap-[4px]">
                <span className={LABEL_CLASS}>{esCL.agregaExpo.galleryNameLabel}</span>
                <input name="galleryName" type="text" required list="galleries-datalist" className={INPUT_CLASS} />
                <datalist id="galleries-datalist">
                  {galleries.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </label>
              <label className="flex flex-col gap-[4px]">
                <span className={LABEL_CLASS}>{esCL.agregaExpo.comunaLabel}</span>
                <input name="comunaName" type="text" required list="comunas-datalist" placeholder={esCL.agregaExpo.comunaPlaceholder} className={INPUT_CLASS} />
                <datalist id="comunas-datalist">
                  {comunas.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.adminRegionName ?? ""}
                    </option>
                  ))}
                </datalist>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-[20px]">
                <label className="flex flex-col gap-[4px]">
                  <span className={LABEL_CLASS}>{esCL.agregaExpo.openingDatetimeLabel}</span>
                  <input name="openingDatetime" type="datetime-local" required className={INPUT_CLASS} />
                </label>
                <label className="flex flex-col gap-[4px]">
                  <span className={LABEL_CLASS}>{esCL.agregaExpo.runEndDateLabel}</span>
                  <input name="runEndDate" type="date" required className={INPUT_CLASS} />
                </label>
              </div>
            </div>

            {/* Step 3 — how it looks */}
            <div ref={(el) => { stepRefs.current[2] = el; }} className={step === 2 ? "flex flex-col gap-[20px]" : "hidden"}>
              <div className="flex items-center gap-[16px]">
                <label htmlFor="agrega-expo-image-input" className={`${PILL_BUTTON} bg-text-primary text-text-placeholder hover:bg-brand-magenta hover:border-brand-magenta hover:text-white`}>
                  {(image ? esCL.agregaExpo.changeImage : esCL.agregaExpo.chooseImage).toUpperCase()}
                </label>
                <input
                  id="agrega-expo-image-input"
                  name="images"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                {image && (
                  // eslint-disable-next-line @next/next/no-img-element -- ephemeral local preview via createObjectURL, not a real asset
                  <img src={URL.createObjectURL(image)} alt="" className="w-[72px] h-[90px] object-cover" />
                )}
                {status === "compressing" && <span className="font-geist text-[14px] text-text-primary">{esCL.agregaExpo.compressing}</span>}
              </div>
              <label className="flex flex-col gap-[4px]">
                <span className={LABEL_CLASS}>{esCL.agregaExpo.descriptionLabel}</span>
                <textarea name="description" required rows={4} className={`${INPUT_CLASS} resize-none`} />
              </label>
            </div>

            {/* Step 4 — who sends it */}
            <div ref={(el) => { stepRefs.current[3] = el; }} className={step === 3 ? "flex flex-col gap-[20px]" : "hidden"}>
              <label className="flex flex-col gap-[4px]">
                <span className={LABEL_CLASS}>{esCL.agregaExpo.submitterNameLabel}</span>
                <input name="submitterName" type="text" required className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-[4px]">
                <span className={LABEL_CLASS}>{esCL.agregaExpo.submitterEmailLabel}</span>
                <input name="submitterEmail" type="email" required className={INPUT_CLASS} />
              </label>
            </div>

            {formError && <p className="font-geist font-semibold text-[14px] text-red-700">{formError}</p>}

            <div className="flex items-center justify-between gap-[16px]">
              {step > 0 ? (
                <button type="button" onClick={() => { setFormError(""); setStep(step - 1); }} className="font-geist font-semibold text-[15px] text-text-primary underline cursor-pointer">
                  {esCL.agregaExpo.back}
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={busy}
                className={`${PILL_BUTTON} ${
                  step === STEP_COUNT - 1
                    ? "bg-text-primary text-text-placeholder hover:bg-brand-magenta hover:border-brand-magenta hover:text-white"
                    : "bg-transparent text-text-primary hover:bg-text-primary hover:text-text-placeholder"
                }`}
              >
                {status === "sending" ? esCL.agregaExpo.sending : step === STEP_COUNT - 1 ? esCL.agregaExpo.submitStep : esCL.agregaExpo.next}
              </button>
            </div>
          </form>
        )}
      </section>

      <p className="font-geist text-[13px] leading-[1.5] text-[#5e6668] max-w-[720px] mt-[16px]">
        {esCL.agregaExpo.scopeNote}
        <button type="button" onClick={() => setContactOpen(true)} className="underline cursor-pointer">
          formulario de contacto
        </button>
        .
      </p>

      <div className="mt-[60px] md:mt-[120px]">
        <Footer onContactClick={() => setContactOpen(true)} />
      </div>

      <DrawerShell open={contactOpen} onClose={() => setContactOpen(false)}>
        <ContactPanel onBack={() => setContactOpen(false)} onClose={() => setContactOpen(false)} />
      </DrawerShell>
    </main>
  );
}
