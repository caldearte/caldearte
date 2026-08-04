import { test } from "node:test";
import assert from "node:assert/strict";
import { zoneKeyForRegion } from "./zones";

test("zoneKeyForRegion: maps every one of the 16 real admin_region_name values", () => {
  assert.equal(zoneKeyForRegion("Arica y Parinacota"), "norte-grande");
  assert.equal(zoneKeyForRegion("Tarapacá"), "norte-grande");
  assert.equal(zoneKeyForRegion("Antofagasta"), "norte-grande");
  assert.equal(zoneKeyForRegion("Atacama"), "norte-chico");
  assert.equal(zoneKeyForRegion("Coquimbo"), "norte-chico");
  assert.equal(zoneKeyForRegion("Valparaíso"), "central");
  assert.equal(zoneKeyForRegion("Región Metropolitana de Santiago"), "central");
  assert.equal(zoneKeyForRegion("Región del Libertador Gral. Bernardo O'Higgins"), "central");
  assert.equal(zoneKeyForRegion("Región del Maule"), "central");
  assert.equal(zoneKeyForRegion("Región de Ñuble"), "sur");
  assert.equal(zoneKeyForRegion("Región del Biobío"), "sur");
  assert.equal(zoneKeyForRegion("Región de la Araucanía"), "sur");
  assert.equal(zoneKeyForRegion("Región de Los Ríos"), "sur");
  assert.equal(zoneKeyForRegion("Región de Los Lagos"), "sur");
  assert.equal(zoneKeyForRegion("Región Aisén del Gral. Carlos Ibáñez del Campo"), "austral");
  assert.equal(zoneKeyForRegion("Región de Magallanes y de la Antártica Chilena"), "austral");
});

test("zoneKeyForRegion: falls back to null for anything unmapped", () => {
  assert.equal(zoneKeyForRegion("Región Inventada"), null);
});
