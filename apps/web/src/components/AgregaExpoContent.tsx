"use client";

import { useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { esCL } from "@/i18n/es-CL";
import { compressImage } from "@/lib/compressImage";
import Footer from "./Footer";
import DrawerShell from "./DrawerShell";
import ContactPanel from "./ContactPanel";
import SiteWordmark from "@/components/SiteWordmark";
import FormField, { FIELD_BOX, FIELD_BOX_INVALID } from "./FormField";
import ComunaCombobox, { type ComunaOption } from "./ComunaCombobox";

type Status = "idle" | "compressing" | "sending" | "approved" | "rejected" | "rate_limited" | "error";
type Errors = Partial<Record<string, string>>;

const PILL_BUTTON =
  "cursor-pointer rounded-[75px] border-4 border-text-primary font-lato font-black text-[20px] md:text-[24px] px-[20px] py-[8px] transition-colors disabled:cursor-default disabled:opacity-60";

const STEP_COUNT = esCL.agregaExpo.steps.length;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Half-hour slots for the opening hour — every real opening in the data
// sits on :00 or :30, and a list is quicker to hit on a phone than a
// native time wheel.
const TIME_SLOTS = Array.from({ length: (23 - 9) * 2 + 1 }, (_, i) => {
  const h = 9 + Math.floor(i / 2);
  return `${String(h).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
});

// "Agrega tu expo" as four short steps (2026-10-13, Daniel: simpler and
// faster to fill) in the newsletter form's look — gray-blue panel, Lato
// Black headline with one magenta word, round buttons — and the shared
// field chrome (FormField: white boxes, visible labels, light-gray
// examples, errors under each field). Artists are chips, the comuna a
// search-and-pick list, date and hour separate, the image a big drop area
// with a 4:5 preview. One <form> holds every step; the final submit sends
// the same fields to /api/submit-event as before (openingDatetime is
// rebuilt as "YYYY-MM-DDTHH:MM" from the date + hour).
export default function AgregaExpoContent({ comunas, galleries }: { comunas: ComunaOption[]; galleries: string[] }) {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [resultMessage, setResultMessage] = useState<string>("");
  const [errors, setErrors] = useState<Errors>({});
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [artists, setArtists] = useState<string[]>([]);
  const [artistDraft, setArtistDraft] = useState("");
  const [comuna, setComuna] = useState<ComunaOption | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function clearError(name: string) {
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  }

  async function handleImageChange(file: File | null) {
    if (!file || !file.type.startsWith("image/")) return;
    clearError("image");
    setStatus("compressing");
    let next = file;
    try {
      next = await compressImage(file);
    } catch {
      // keep the original
    }
    setImage(next);
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(next);
    });
    setStatus("idle");
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    handleImageChange(e.dataTransfer.files?.[0] ?? null);
  }

  // Artist chips: Enter or comma turns what's typed into a chip.
  function commitArtistDraft(): string[] {
    const name = artistDraft.trim().replace(/,$/, "").trim();
    if (!name) return artists;
    const next = artists.includes(name) ? artists : [...artists, name];
    setArtists(next);
    setArtistDraft("");
    clearError("artist");
    return next;
  }

  function onArtistKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitArtistDraft();
    } else if (e.key === "Backspace" && artistDraft === "" && artists.length > 0) {
      setArtists(artists.slice(0, -1));
    }
  }

  function validateStep(i: number): boolean {
    const data = new FormData(formRef.current!);
    const value = (name: string) => ((data.get(name) as string | null) ?? "").trim();
    const next: Errors = {};
    const required = esCL.agregaExpo.required;
    if (i === 0) {
      if (!value("title")) next.title = required;
      if (commitArtistDraft().length === 0) next.artist = esCL.agregaExpo.noArtist;
    }
    if (i === 1) {
      if (!value("galleryName")) next.galleryName = required;
      if (!comuna) next.comuna = esCL.agregaExpo.comunaNotInList;
      if (!value("openingDate")) next.openingDate = required;
      if (!value("openingTime")) next.openingTime = required;
      if (!value("runEndDate")) next.runEndDate = required;
      else if (value("openingDate") && value("runEndDate") < value("openingDate")) next.runEndDate = esCL.agregaExpo.endBeforeStart;
    }
    if (i === 2) {
      if (!image) next.image = esCL.agregaExpo.noImage;
      if (!value("description")) next.description = required;
    }
    if (i === 3) {
      if (!value("submitterName")) next.submitterName = required;
      if (!EMAIL_RE.test(value("submitterEmail"))) next.submitterEmail = value("submitterEmail") ? esCL.agregaExpo.invalidEmail : required;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateStep(step)) return;
    // Enter in a field, or "Siguiente": next step until the last one.
    if (step < STEP_COUNT - 1) {
      setStep(step + 1);
      return;
    }
    if (!image || !comuna) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("comunaName", comuna.name);
    formData.set("regionId", comuna.id);
    formData.set("artist", artists.join(", "));
    formData.set("openingDatetime", `${formData.get("openingDate")}T${formData.get("openingTime")}`);
    formData.delete("openingDate");
    formData.delete("openingTime");
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
        setImageUrl(null);
        setArtists([]);
        setComuna(null);
        setStep(0);
      }
    } catch {
      setStatus("error");
    }
  }

  const busy = status === "sending" || status === "compressing";
  const done = status === "approved" || status === "rejected" || status === "rate_limited" || status === "error";
  const heading = esCL.agregaExpo.steps[step];
  const box = (name: string) => `${FIELD_BOX} ${errors[name] ? FIELD_BOX_INVALID : ""}`;

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
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            onInput={(e) => clearError((e.target as HTMLInputElement).name)}
            noValidate
            className="flex flex-col gap-[28px] md:gap-[32px]"
          >
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

            {/* Step 1 — the show */}
            <div className={step === 0 ? "flex flex-col gap-[20px]" : "hidden"}>
              <FormField label={esCL.agregaExpo.titleLabel} htmlFor="ae-title" error={errors.title}>
                <input id="ae-title" name="title" type="text" placeholder={esCL.agregaExpo.titlePlaceholder} className={box("title")} />
              </FormField>
              <FormField label={esCL.agregaExpo.artistLabel} htmlFor="ae-artist" error={errors.artist}>
                {artists.length > 0 && (
                  <div className="flex flex-wrap gap-[8px]">
                    {artists.map((a) => (
                      <span key={a} className="inline-flex items-center gap-[6px] rounded-full bg-text-primary text-surface-sage pl-[12px] pr-[6px] py-[5px] font-geist font-semibold text-[14px]">
                        {a}
                        <button
                          type="button"
                          aria-label={esCL.agregaExpo.removeArtist(a)}
                          onClick={() => setArtists(artists.filter((x) => x !== a))}
                          className="size-[22px] rounded-full flex items-center justify-center hover:bg-surface-sage/20 cursor-pointer"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-[8px]">
                  <input
                    id="ae-artist"
                    type="text"
                    value={artistDraft}
                    onChange={(e) => setArtistDraft(e.target.value)}
                    onKeyDown={onArtistKeyDown}
                    onBlur={() => commitArtistDraft()}
                    placeholder={esCL.agregaExpo.artistPlaceholder}
                    className={`${FIELD_BOX} ${errors.artist ? FIELD_BOX_INVALID : ""} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => commitArtistDraft()}
                    className="shrink-0 h-[48px] px-[16px] rounded-[12px] bg-text-primary text-surface-sage font-geist font-semibold text-[14px] cursor-pointer hover:bg-brand-magenta hover:text-white"
                  >
                    {esCL.agregaExpo.addArtistButton}
                  </button>
                </div>
              </FormField>
            </div>

            {/* Step 2 — where and when */}
            <div className={step === 1 ? "flex flex-col gap-[20px]" : "hidden"}>
              <FormField label={esCL.agregaExpo.galleryNameLabel} htmlFor="ae-gallery" error={errors.galleryName}>
                <input id="ae-gallery" name="galleryName" type="text" list="galleries-datalist" placeholder={esCL.agregaExpo.galleryPlaceholder} className={box("galleryName")} />
                <datalist id="galleries-datalist">
                  {galleries.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </FormField>
              <FormField label={esCL.agregaExpo.comunaLabel} htmlFor="ae-comuna" error={errors.comuna}>
                <ComunaCombobox
                  id="ae-comuna"
                  comunas={comunas}
                  value={comuna}
                  onChange={(c) => {
                    setComuna(c);
                    if (c) clearError("comuna");
                  }}
                  invalid={!!errors.comuna}
                />
              </FormField>
              <div className="grid grid-cols-[minmax(0,1fr)_120px] sm:grid-cols-[minmax(0,1fr)_150px] gap-[12px] items-end">
                <FormField label={esCL.agregaExpo.openingDateLabel} htmlFor="ae-date" error={errors.openingDate}>
                  <input id="ae-date" name="openingDate" type="date" className={box("openingDate")} />
                </FormField>
                <FormField label={esCL.agregaExpo.openingTimeLabel} htmlFor="ae-time" error={errors.openingTime}>
                  <select id="ae-time" name="openingTime" defaultValue="" className={`${box("openingTime")} appearance-none`}>
                    <option value="" disabled>
                      {esCL.agregaExpo.openingTimePlaceholder}
                    </option>
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              <FormField label={esCL.agregaExpo.runEndLabel} htmlFor="ae-end" error={errors.runEndDate}>
                <input id="ae-end" name="runEndDate" type="date" className={box("runEndDate")} />
              </FormField>
            </div>

            {/* Step 3 — how it looks */}
            <div className={step === 2 ? "flex flex-col gap-[20px]" : "hidden"}>
              <FormField label={esCL.agregaExpo.imagesLabel} htmlFor="agrega-expo-image-input" error={errors.image} hint={esCL.agregaExpo.imageHint}>
                <label
                  htmlFor="agrega-expo-image-input"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`flex items-center gap-[16px] p-[14px] rounded-[12px] bg-surface-white border-2 border-dashed cursor-pointer ${
                    errors.image ? "border-red-600" : dragging ? "border-brand-magenta" : "border-text-primary/30 hover:border-text-primary/60"
                  }`}
                >
                  <span className="relative shrink-0 w-[96px] aspect-[4/5] rounded-[6px] overflow-hidden bg-surface-sage flex items-center justify-center">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- ephemeral local preview via createObjectURL, not a real asset
                      <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- static icon
                      <img src="/icons/framed-art.svg" alt="" width={36} height={36} className="opacity-60" />
                    )}
                  </span>
                  <span className="font-geist font-semibold text-[15px] text-text-primary">
                    {status === "compressing" ? esCL.agregaExpo.compressing : image ? esCL.agregaExpo.changeImage : esCL.agregaExpo.imageDrop}
                  </span>
                </label>
                <input
                  id="agrega-expo-image-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </FormField>
              <FormField label={esCL.agregaExpo.descriptionLabel} htmlFor="ae-description" error={errors.description}>
                <textarea
                  id="ae-description"
                  name="description"
                  rows={4}
                  placeholder={esCL.agregaExpo.descriptionPlaceholder}
                  className={`${box("description")} h-auto py-[12px] resize-none`}
                />
              </FormField>
            </div>

            {/* Step 4 — who sends it */}
            <div className={step === 3 ? "flex flex-col gap-[20px]" : "hidden"}>
              <FormField label={esCL.agregaExpo.submitterNameLabel} htmlFor="ae-name" error={errors.submitterName}>
                <input id="ae-name" name="submitterName" type="text" autoComplete="name" placeholder={esCL.agregaExpo.namePlaceholder} className={box("submitterName")} />
              </FormField>
              <FormField label={esCL.agregaExpo.submitterEmailLabel} htmlFor="ae-email" error={errors.submitterEmail}>
                <input id="ae-email" name="submitterEmail" type="email" autoComplete="email" inputMode="email" placeholder={esCL.agregaExpo.emailPlaceholder} className={box("submitterEmail")} />
              </FormField>
            </div>

            <div className="flex items-center justify-between gap-[16px]">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setErrors({});
                    setStep(step - 1);
                  }}
                  className="font-geist font-semibold text-[15px] text-text-primary underline cursor-pointer"
                >
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
