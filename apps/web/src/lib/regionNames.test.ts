import { test } from "node:test";
import assert from "node:assert/strict";
import { shortRegionName } from "./regionNames";

test("shortRegionName: shortens every one of the 16 real admin_region_name values", () => {
  assert.equal(shortRegionName("Arica y Parinacota"), "Arica y Parinacota");
  assert.equal(shortRegionName("Tarapacá"), "Tarapacá");
  assert.equal(shortRegionName("Antofagasta"), "Antofagasta");
  assert.equal(shortRegionName("Atacama"), "Atacama");
  assert.equal(shortRegionName("Coquimbo"), "Coquimbo");
  assert.equal(shortRegionName("Valparaíso"), "Valparaíso");
  assert.equal(shortRegionName("Región Metropolitana de Santiago"), "Santiago");
  assert.equal(shortRegionName("Región del Libertador Gral. Bernardo O'Higgins"), "O'Higgins");
  assert.equal(shortRegionName("Región del Maule"), "Maule");
  assert.equal(shortRegionName("Región de Ñuble"), "Ñuble");
  assert.equal(shortRegionName("Región del Biobío"), "Biobío");
  assert.equal(shortRegionName("Región de la Araucanía"), "Araucanía");
  assert.equal(shortRegionName("Región de Los Ríos"), "Los Ríos");
  assert.equal(shortRegionName("Región de Los Lagos"), "Los Lagos");
  assert.equal(shortRegionName("Región Aisén del Gral. Carlos Ibáñez del Campo"), "Aisén");
  assert.equal(shortRegionName("Región de Magallanes y de la Antártica Chilena"), "Magallanes");
});

test("shortRegionName: falls back to the original string for anything unmapped", () => {
  assert.equal(shortRegionName("Región Inventada"), "Región Inventada");
});
