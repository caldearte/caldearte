"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { statusBoxClass } from "@/lib/formStatusBox";
import { compressImage } from "@/lib/compressImage";
import Footer from "./Footer";
import DrawerShell from "./DrawerShell";
import ContactPanel from "./ContactPanel";

interface Comuna {
  id: string;
  name: string;
  adminRegionName: string | null;
}

type Status = "idle" | "compressing" | "sending" | "approved" | "rejected" | "rate_limited" | "error";

const FIELD_CLASS = "bg-surface-white flex flex-col gap-[6px] px-[16px] py-[14px] rounded-input w-full text-left";
const INPUT_CLASS = "bg-transparent font-geist text-[16px] text-text-primary placeholder:text-[#5e6668] focus:outline-none";
const LABEL_TEXT_CLASS = "font-fragment-mono text-[12px] uppercase text-[#5e6668]";

function findComunaByName(comunas: Comuna[], name: string): Comuna | undefined {
  const normalized = name.trim().toLowerCase();
  return comunas.find((c) => c.name.trim().toLowerCase() === normalized);
}

export default function AgregaExpoContent({ comunas, galleries }: { comunas: Comuna[]; galleries: string[] }) {
  const [status, setStatus] = useState<Status>("idle");
  const [resultMessage, setResultMessage] = useState<string>("");
  const [formError, setFormError] = useState<string>("");
  const [image, setImage] = useState<File | null>(null);
  const [artists, setArtists] = useState<string[]>([""]);
  const [contactOpen, setContactOpen] = useState(false);

  async function handleImageChange(file: File | null) {
    if (!file) {
      setImage(null);
      return;
    }
    setStatus("compressing");
    try {
      setImage(await compressImage(file));
    } catch {
      setImage(file);
    }
    setStatus("idle");
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    if (!image) return;

    const form = e.currentTarget;
    const formData = new FormData(form);

    const comunaInput = (formData.get("comunaName") as string)?.trim() ?? "";
    const comuna = findComunaByName(comunas, comunaInput);
    if (!comuna) {
      setFormError("Elige una comuna de la lista.");
      return;
    }
    formData.set("comunaName", comuna.name);
    formData.set("regionId", comuna.id);

    const artistNames = artists.map((a) => a.trim()).filter(Boolean);
    if (artistNames.length === 0) {
      setFormError("Agrega al menos un artista.");
      return;
    }
    formData.set("artist", artistNames.join(", "));

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
      }
    } catch {
      setStatus("error");
    }
  }

  const busy = status === "sending" || status === "compressing";
  const done = status === "approved" || status === "rejected" || status === "rate_limited" || status === "error";

  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <Link href="/" className="font-lato font-black leading-none text-brand-magenta text-[28px]">
        {esCL.appName}
      </Link>

      <h1 className="font-lato font-black leading-none text-text-primary text-[36px] md:text-[48px] mt-[40px] md:mt-[60px] mb-[16px]">
        {esCL.agregaExpo.title}
      </h1>
      <p className="font-geist text-[15px] md:text-[16px] leading-[1.6] text-text-primary max-w-[560px] mb-[16px]">
        {esCL.agregaExpo.intro}
      </p>
      <p className="font-geist text-[13px] leading-[1.5] text-[#5e6668] max-w-[560px] mb-[40px]">
        {esCL.agregaExpo.scopeNote}
        <button type="button" onClick={() => setContactOpen(true)} className="underline cursor-pointer">
          formulario de contacto
        </button>
        .
      </p>

      {done ? (
        <div className={statusBoxClass(status === "approved" ? "success" : "error", "text-text-primary")}>
          <span className="font-lato font-black">
            {status === "approved" && esCL.agregaExpo.approvedPrefix}
            {status === "rejected" && esCL.agregaExpo.rejectedPrefix}
            {status === "rate_limited" && esCL.agregaExpo.rateLimitedPrefix}
            {status === "error" && esCL.agregaExpo.error}
          </span>
          {status !== "error" && <p className="mt-[8px] normal-case font-geist text-[14px]">{resultMessage}</p>}
          {status !== "approved" && (
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setResultMessage("");
              }}
              className="mt-[16px] underline normal-case font-geist text-[14px]"
            >
              Intentar de nuevo
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-[16px] max-w-[560px]">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

          <label className={FIELD_CLASS}>
            <span className={LABEL_TEXT_CLASS}>{esCL.agregaExpo.titleLabel}</span>
            <input name="title" type="text" required className={INPUT_CLASS} />
          </label>

          <label className={FIELD_CLASS}>
            <span className={LABEL_TEXT_CLASS}>{esCL.agregaExpo.galleryNameLabel}</span>
            <input name="galleryName" type="text" required list="galleries-datalist" className={INPUT_CLASS} />
            <datalist id="galleries-datalist">
              {galleries.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>

          <label className={FIELD_CLASS}>
            <span className={LABEL_TEXT_CLASS}>{esCL.agregaExpo.comunaLabel}</span>
            <input name="comunaName" type="text" required list="comunas-datalist" placeholder={esCL.agregaExpo.comunaPlaceholder} className={INPUT_CLASS} />
            <datalist id="comunas-datalist">
              {comunas.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.adminRegionName ?? ""}
                </option>
              ))}
            </datalist>
          </label>

          <div className={FIELD_CLASS}>
            <span className={LABEL_TEXT_CLASS}>{esCL.agregaExpo.artistLabel}</span>
            <div className="flex flex-col gap-[8px]">
              {artists.map((value, i) => (
                <input
                  key={i}
                  type="text"
                  required={i === 0}
                  value={value}
                  onChange={(e) => setArtists((prev) => prev.map((a, idx) => (idx === i ? e.target.value : a)))}
                  className={INPUT_CLASS}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setArtists((prev) => [...prev, ""])}
              className="self-start underline font-geist text-[13px] text-[#5e6668] cursor-pointer"
            >
              {esCL.agregaExpo.addArtist}
            </button>
          </div>

          <label className={FIELD_CLASS}>
            <span className={LABEL_TEXT_CLASS}>{esCL.agregaExpo.openingDatetimeLabel}</span>
            <input name="openingDatetime" type="datetime-local" required className={INPUT_CLASS} />
          </label>

          <label className={FIELD_CLASS}>
            <span className={LABEL_TEXT_CLASS}>{esCL.agregaExpo.runEndDateLabel}</span>
            <input name="runEndDate" type="date" required className={INPUT_CLASS} />
          </label>

          <label className={FIELD_CLASS}>
            <span className={LABEL_TEXT_CLASS}>{esCL.agregaExpo.descriptionLabel}</span>
            <textarea name="description" required rows={5} className={`${INPUT_CLASS} resize-none`} />
          </label>

          <div className={FIELD_CLASS}>
            <span className={LABEL_TEXT_CLASS}>{esCL.agregaExpo.imagesLabel}</span>
            <label
              htmlFor="agrega-expo-image-input"
              className="self-start cursor-pointer bg-brand-magenta text-surface-sage rounded-input px-[16px] py-[10px] font-geist font-bold text-[13px] text-center"
            >
              {image ? esCL.agregaExpo.changeImage : esCL.agregaExpo.chooseImage}
            </label>
            <input
              id="agrega-expo-image-input"
              name="images"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            {image && (
              // eslint-disable-next-line @next/next/no-img-element -- ephemeral local preview via createObjectURL, not a real asset
              <img src={URL.createObjectURL(image)} alt="" className="w-[96px] h-[96px] object-cover rounded-[4px] mt-[4px]" />
            )}
          </div>

          <label className={FIELD_CLASS}>
            <span className={LABEL_TEXT_CLASS}>{esCL.agregaExpo.submitterNameLabel}</span>
            <input name="submitterName" type="text" required className={INPUT_CLASS} />
          </label>

          <label className={FIELD_CLASS}>
            <span className={LABEL_TEXT_CLASS}>{esCL.agregaExpo.submitterEmailLabel}</span>
            <input name="submitterEmail" type="email" required className={INPUT_CLASS} />
          </label>

          {formError && <p className="font-geist text-[13px] text-red-600">{formError}</p>}

          <button
            type="submit"
            disabled={busy || !image}
            className="w-full bg-brand-magenta text-surface-sage rounded-input py-[16px] font-geist font-bold text-[14px] text-center disabled:opacity-60"
          >
            {status === "sending" ? esCL.agregaExpo.sending : status === "compressing" ? "Preparando imagen..." : esCL.agregaExpo.submit}
          </button>
        </form>
      )}

      <div className="mt-[60px] md:mt-[120px]">
        <Footer onContactClick={() => setContactOpen(true)} />
      </div>

      <DrawerShell open={contactOpen} onClose={() => setContactOpen(false)}>
        <ContactPanel onBack={() => setContactOpen(false)} onClose={() => setContactOpen(false)} />
      </DrawerShell>
    </main>
  );
}
