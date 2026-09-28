import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogKey, handleMatchesName, splitArtistNames, venueKey } from "./catalog.js";

test("catalogKey strips accents, case and punctuation", () => {
  assert.equal(catalogKey("Tomás Núñez San Martín"), "tomas nunez san martin");
  assert.equal(catalogKey("  MAVI UC — Sala 2 "), "mavi uc sala 2");
});

test("venueKey keeps same-named places in different administrative regions apart", () => {
  assert.notEqual(
    venueKey("Centro Cultural Gabriela Mistral", "Región Metropolitana de Santiago"),
    venueKey("Centro Cultural Gabriela Mistral", "Región de Valparaíso"),
  );
  assert.equal(venueKey("Museo Baburizza", null), "museo baburizza|");
  assert.equal(venueKey("Taller 99", "Región Metropolitana de Santiago"), "taller 99|region metropolitana de santiago");
});

test("splitArtistNames splits the separators Haiku uses", () => {
  assert.deepEqual(splitArtistNames("Pedro Lagos, Mario Rojas"), ["Pedro Lagos", "Mario Rojas"]);
  assert.deepEqual(splitArtistNames("Carla Muñoz y Diego Fuentes"), ["Carla Muñoz", "Diego Fuentes"]);
  assert.deepEqual(splitArtistNames("Rosa Kim, Elena Pardo, Sara Millán"), ["Rosa Kim", "Elena Pardo", "Sara Millán"]);
  assert.deepEqual(splitArtistNames("Ana & Luis Pérez"), ["Ana", "Luis Pérez"]);
});

test("splitArtistNames keeps a single name whole", () => {
  assert.deepEqual(splitArtistNames("Wassily Kandinsky"), ["Wassily Kandinsky"]);
  assert.deepEqual(splitArtistNames("Colectivo de Grabado Juan Pérez Rojas"), [
    "Colectivo de Grabado Juan Pérez Rojas",
  ]);
  assert.deepEqual(splitArtistNames(null), []);
  assert.deepEqual(splitArtistNames(""), []);
});

test("splitArtistNames drops curators and crowd labels, expands member lists", () => {
  assert.deepEqual(splitArtistNames("Núcleo de Investigación Visual del Sur (NIVS)"), ["Núcleo de Investigación Visual del Sur"]);
  assert.deepEqual(splitArtistNames("Curaduría de Julio Mena — Colectivo Taller (Ana Vidal, Pía Correa), Laura Soto"), [
    "Ana Vidal",
    "Pía Correa",
    "Colectivo Taller",
    "Laura Soto",
  ]);
  assert.deepEqual(splitArtistNames("19 artistas de las escuelas de arte"), []);
  assert.deepEqual(splitArtistNames("Clara Ibáñez, Taller 101, y otros"), ["Clara Ibáñez", "Taller 101"]);
});

test("splitArtistNames dedupes spellings of the same name", () => {
  assert.deepEqual(splitArtistNames("Inés Molina, Ines Molina"), ["Inés Molina"]);
});

test("handleMatchesName needs every meaningful word of the name in the handle", () => {
  assert.equal(handleMatchesName("ana_rios_vera", "Ana Ríos Vera"), true);
  assert.equal(handleMatchesName("tomas.nunez.san.martin", "Tomás Núñez San Martín"), true);
  assert.equal(handleMatchesName("lucia_pradom", "Lucía Prado"), true);
  assert.equal(handleMatchesName("inesmolinaq", "Inés Molina"), true);
  assert.equal(handleMatchesName("pinturasmolina", "Paula Medina"), false);
  assert.equal(handleMatchesName("extension_universidad", "Inés Molina"), false);
  // One word is not enough to claim an identity.
  assert.equal(handleMatchesName("camila_arte", "Camila"), false);
});
