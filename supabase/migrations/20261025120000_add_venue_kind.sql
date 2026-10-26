-- Venue kind (Daniel, 2026-10-25): what share of the calendar comes from
-- recognized institutions vs. municipal and independent spaces. It's the
-- mission's own yardstick — every space gets the same interest and
-- seriousness — and a candidate number for funders.
--
--   institucional  museums, large cultural centres, universities,
--                  established commercial galleries, corporate foundations
--   municipal      casas de la cultura, municipal/comunal cultural centres,
--                  public libraries, municipal theatres
--   independiente  self-run, artist-run, community, emerging spaces
--   null           not classified yet (every venue the catalog sync
--                  creates from now on, until someone sets it by hand)
--
-- Private on purpose: `venues_public` does NOT expose it. Labelling a
-- space "not institutional" on its public page is an editorial judgment we
-- haven't made, and nothing in curation reads it — it must never decide
-- what enters the calendar.
--
-- The initial classification below is a one-off hand pass by name over
-- the 301 venues with live events in production on 2026-10-25 (the one
-- junk row named just "Valdivia" stays null). Edge cases are judgment
-- calls, e.g. BARCO, Galería Metropolitana, Casa Foto → independiente;
-- Galería 1712, Postigo → institucional. Correct a row with a plain
-- UPDATE; the ids only exist in production, so locally these are no-ops.
--
-- Additive: one nullable column, one view, no existing data changes
-- meaning. Reverting is `drop view venue_kind_share; alter table venues
-- drop column kind`.

alter table venues
  add column kind text
  constraint venues_kind_check check (kind in ('institucional', 'municipal', 'independiente'));

-- institucional: 144
update venues set kind = 'institucional' where id in (
  'c8f798f9-1198-46f3-9ba7-8d891c7a3452', -- Aninat Galería
  '22348766-db99-47f9-bcb2-a92c9a80f3d1', -- Auditorio de la Facultad de Artes
  '7d56a07e-a37e-4a91-8f10-d3758528c58d', -- Balmaceda Arte Joven
  'e2e59881-678b-4493-b006-fc83998d3ec0', -- Balmaceda Arte Joven Antofagasta
  '0713e82e-bf46-48f5-9833-9c3d752e9a50', -- Balmaceda Arte Joven Biobío
  '192d5ce6-c09d-4686-a944-9273cf8f02d8', -- Balmaceda Arte Joven Los Lagos
  '09616b7c-e8b5-4fb6-8d9b-ff260527e783', -- Biblioteca FAU UCHILE
  '26a0f3ae-3612-41a7-9d37-046116fd1925', -- Biblioteca Nacional
  'f7a1a29d-cbc8-43f1-995f-ca177bd1d7b4', -- CCE Santiago (Centro Cultural de España en Santiago)
  'bc5995bc-84a9-4a22-a82c-74f004b22bba', -- CREA Biblioteca UVM, Campus Recreo
  '1f2f36fe-af2a-4182-9d81-ad406110c674', -- Campus JGM
  '886bb252-79ba-4ce5-a5b1-7277ecdce994', -- Campus Villarrica, Universidad Austral de Chile, Edificio Monseñor Paul Wevering
  '1cec43eb-5c3d-4aaa-a743-838daa9c180c', -- Casa Mecenas
  'fc9befd7-fafd-48dd-b0d4-723e36b0cc10', -- Casa Museo Santa Rosa de Apoquindo
  'e450dcda-e749-457f-b18f-73be71b043fd', -- Casa del Arte de la Universidad de Concepción
  '4f20b62f-628a-427a-894c-cde0344069a0', -- Centex
  'de3be524-0889-4f49-a74f-d4512e41b13a', -- Centro Cultural Estación Mapocho
  'c02221fb-6183-4f00-8250-12bd295a2edc', -- Centro Cultural Gabriela Mistral
  '3203a102-f5a6-4db2-95f8-090100e011dc', -- Centro Cultural Gabriela Mistral - GAM
  'c6b31ba0-6aa9-433a-8987-14b01fd5c770', -- Centro Cultural La Moneda
  'd4996290-6a0a-4321-8c5b-1001649402bc', -- Centro Cultural Las Condes
  'b3461c6f-7600-44a3-bd40-e2546e8c87d3', -- Centro Cultural de España - CCE Santiago de Chile
  'd1b0bc59-e406-484b-ba98-c37c67505a0f', -- Centro Cultural de España en Chile
  '11215ce9-260c-4ed8-856e-55321b14358e', -- Centro Nacional de Arte Contemporáneo
  'a1ac0a42-1f8a-4671-90b3-31b62bd3bc60', -- Centro Patrimonial Posada del Corregidor
  '43d234c4-d6ec-45a7-afc5-7af2275c1307', -- Centro de Arte Molino Machmar (CAMM)
  '87fbc25c-6baf-4861-95dc-25a246077ec9', -- Centro de Extensión Curicó
  '981d805c-b41d-4319-a11d-00cdb6aeb390', -- Centro de Extensión Los Canelos UACh
  '9792b843-b915-4487-961a-8ff7fd47d43b', -- Centro de Extensión Palacio Pereira
  'b066f452-ce03-46e8-b4bd-bbe5c73c67b2', -- Cineteca de la Universidad de Chile / Plataforma Cultural Campus Juan Gómez Millas
  '82ee8acd-a3b9-4501-aa77-292f34014c4e', -- Collectio
  'ec500802-d311-4213-b02d-38613ad1f551', -- Collectio, Vitacura
  'f6066cbe-362b-4e87-abb0-6f7936c8cdfe', -- D21
  '2f4c69e6-4c2e-4053-b811-d0cfd970c10d', -- De Sarmiento Galería
  'bb50e7d8-18bb-441b-b4d2-da259302f06c', -- Edificio de Ingeniería de la Universidad de Magallanes (UMAG)
  '92b8c06e-bc0d-42c3-b707-37198d6d5d1d', -- Eduardo Lira Art Gallery
  'f427ed7b-5c8d-4fd5-b128-bab38f9424b6', -- Espacio Andrea Brunson
  '87659632-76cb-4466-ae90-007c66ede041', -- Espacio Cultural Las Condes
  'ee7f0156-de1e-45dc-b2e7-fcb63c5237c8', -- Espacio Londres
  '30e5c8ec-73be-4b2f-a1d5-d943e0179598', -- Ex Aduana
  '060fc5da-f657-440f-94b4-b955855dc09d', -- Factor F
  '8cd4a1dc-b14c-44f2-b0b0-0055b8c46938', -- Factoría Santa Rosa
  '7d34ea86-99d7-4122-9336-9f2c5552ba98', -- Fundación Cultural Providencia (Palacio Schacht)
  '21d3226d-bd48-43bf-a99d-408985cfeff7', -- Fundación Nemesio Antúnez
  '2fea2725-72ad-4ab7-95fc-9e9ff508362e', -- Galeria NAC
  'c505269d-0346-4e07-bcf3-0249f398e55f', -- Galería 1712
  '84f29263-c167-410d-a01e-a5c66eb40bca', -- Galería Activa de Balmaceda Arte Joven Los Lagos
  'ddd64ea8-fa70-4cea-a521-0b4dbbd8f4fc', -- Galería Artes Visuales | Matucana 100
  'ddd80e39-6770-4da4-bcd7-762beabcba56', -- Galería Artespacio
  '812bcbb4-36f4-4ba8-82ba-8ab3c2dd9cfb', -- Galería Concreta de Matucana 100
  'b3c7d68f-83fe-468f-8bf9-23637b6ded76', -- Galería Gabriela Mistral
  '9a437902-afee-4bfb-9c6f-2793a0e44619', -- Galería Lo Contador (FADEU UC)
  '25eeb89c-4f20-4fc3-b3d9-a44089df58a5', -- Galería Macchina
  'b7177365-fe7b-494d-899d-f05643cf2d6d', -- Galería Micromedios FAU
  '4ff7a701-9fa0-4b5e-9dbc-5cf6a1f9ced1', -- Galería Modigliani
  '2dc3a467-c8e3-4c0b-9c13-0ce9f75c765a', -- Galería Nemesio Antúnez
  '3a3caa1f-f4a3-42ac-a2d5-4185aa132f8d', -- Galería Patricia Ready
  'c78f1f64-7bbc-4d84-beec-a9565382e952', -- Galería Réplica UACh
  '9cb84196-58ed-4139-9305-d651942c5072', -- Galería Tránsitos Visuales, UdeC Campus Chillán
  'bed42135-f725-46c3-b0b3-86c8639d1a65', -- Galería de Arte - Centro de Extensión UC
  '0e89f337-76b5-446b-85d6-5281a3c347ab', -- Galería de Arte BAJ Metropolitana
  '23e7dc51-d51e-4ddc-8893-0cf438155352', -- Galería de Arte Postigo
  '2ea5e3bf-7a4c-452d-8ae1-495309f0a49d', -- Galería de Arte UCT
  'c49b91cb-eb66-4376-ba5c-2d5e7934948e', -- Galería de Arte, Casa Central UC
  '37b98e5d-1e1b-47d4-8018-3ea3d5be788a', -- Hall Biblioteca, FAU UCHILE
  '1915b8fa-4433-4f28-8ff6-668de90b660a', -- Hall Central FAU
  '3e8f5252-8660-44bb-b91f-801489a840d4', -- Hall del Arte, Departamento de Estudios Humanísticos
  '420f566a-0df2-44c5-a725-795b8e551749', -- Instituto de Arte PUCV
  'f7868bc8-2a23-4d52-afc9-bbd177b86b7b', -- Isabel Croxatto Galería
  'c543d4ba-0087-4ab0-9b09-17acc2762d30', -- Lo Matta Cultural
  'f17b43e2-7ff0-41a2-bd8c-d2fd073bc6bc', -- MAC - Museo de Arte Contemporáneo
  'a102e85f-ae41-42cf-98c0-b809c50a01b1', -- MAC - Quinta Normal
  '1a16d287-39e3-4047-abfa-60048f117521', -- MAC Parque Forestal
  'ebbff581-9176-4dbc-82a5-a1f43ba4733e', -- MAM Chiloé
  'ad834376-f620-4931-ab29-7d011684e3b9', -- MAPA - Plataforma Cultural Universidad de Chile
  '60a65384-6f38-4cfb-9aad-77b7f4e6d9fa', -- MAVI UC
  'ff511d26-be7a-42c2-a221-37ec6e6c811f', -- MUG-UPLA
  '54aa03c2-b642-426e-89f4-4e56eb0d0567', -- Mahara+Co Santiago
  '50cb1a02-0a6a-40fb-bc5a-2e6f57c3df96', -- Matucana 100
  '98966fcd-c5f2-485d-8254-df29bdf954f0', -- Museo Andino, Sala Textil
  '274c7d0c-b475-4001-836e-392d5db8bb22', -- Museo Arte al Límite
  '32423b6e-3167-451b-8ed1-eb557a9b75c4', -- Museo Artequín
  'f9dd505d-57be-4e10-afa7-eb7cdcd17be3', -- Museo Baburizza
  '05d56d2b-c653-4c9d-929d-8779da608dc2', -- Museo CCPAC
  '119d7863-062d-48a3-b8f8-5325310a7d40', -- Museo Chileno de Arte Precolombino
  '95bb03ad-3555-4882-b908-9d7a9942dea0', -- Museo Histórico Gabriel González Videla
  'b41a3132-016c-462b-a59a-34f09be8806f', -- Museo Histórico Nacional - Sala Patrimonial
  '6e672bee-2a0d-4bc7-9c2d-868529b4545b', -- Museo Histórico y Antropológico Maurice van de Maele
  '3d2af260-5bc2-487b-b146-4a81481f0de5', -- Museo Nacional de Bellas Artes
  'ccb07710-4b7c-4a12-8994-fcb24122d85c', -- Museo Nacional de Bellas Artes, Ala norte
  'ee64b242-62ec-4196-832d-bc7a3f6a2388', -- Museo Nacional de Bellas Artes, Sala Chile
  '9ec057ba-1fac-4cb8-b35b-837b91178528', -- Museo O'Higginiano y de Bellas Artes de Talca
  'e232161f-dfdb-462a-8612-7ff444f07048', -- Museo Palacio Vergara
  'bb5657e5-fa89-4e0a-82df-1f2ffcabfb95', -- Museo Philippi / Museo Maurice van de Maele / Espacio Cultural La Leñera / Galería Réplica
  '0b8261c7-1503-49d9-8af1-052e18e02721', -- Museo Ralli
  '66c81088-211e-4b4a-b27c-dba2004086f7', -- Museo Ralli Santiago
  '386906d9-83bd-4f35-9e55-6e54766cdcfb', -- Museo Regional Araucania
  '30c20a47-fda6-4fd4-84ca-e4cf42b36568', -- Museo Regional de Ancud
  '68307fcc-1fc7-4a58-abfb-dc4520b6b284', -- Museo Regional de Atacama
  '38fc6bea-ef71-4b17-93e6-5d47d166c274', -- Museo Regional de Atacama, Sala de exhibiciones temporales
  '286bdf8f-3bdb-4e04-8781-bc44fc836f7c', -- Museo Regional de Aysén
  '5192d47f-4c30-4768-9042-0cb1e4762f4b', -- Museo Regional de Aysén, Cocina de Peones
  '608487cd-ea3d-448c-b3f0-5acf2be7325e', -- Museo Regional de Rancagua
  '8ae22996-9326-464f-9957-7a01641c582e', -- Museo de Arte Popular Americano (MAPA)
  '86ad40ec-296c-457b-b846-ce7a6593e509', -- Museo de Artes Decorativas
  '94a0f3f9-3b3e-4f77-af34-cc412f3812f3', -- Museo de Historia Natural de Valparaíso
  'fe7ad149-b45d-488f-9413-079264a1eebe', -- Museo de Santiago - Casa Colorada
  '6f4bc3c0-e64a-4c9e-90f0-a26d18618f6f', -- Museo de Sitio Geoglifos de Pintados
  '527816aa-1996-4049-b069-355d3987bf4b', -- Museo de la Exploración R. A. Philippi
  'b22afb44-477e-40f8-b04f-2729443c57c7', -- Museo de la Memoria y los Derechos Humanos
  'b5e09d89-eb37-4c4b-9dcd-693a88942d79', -- Museo de la Solidaridad Salvador Allende
  'c56b4577-f8e1-499e-b601-9267ee595e93', -- Palacio Baburizza (Museo de Bellas Artes)
  'fbae281d-ccb2-4305-a36a-487085d6590d', -- Parque Cultural Valparaíso, Sala Laboratorio
  '357a19a2-dab5-454a-9d1c-30760db24be9', -- Parque Cultural de Valparaíso
  '137d0a1a-ed00-4c23-8c6c-d2f33da69335', -- Parque de las Esculturas de Providencia
  '55086f50-b681-4b05-a32f-d851e455326f', -- Patio Ignacio Domeyko, Universidad de Chile
  '627e2317-5d84-4434-a15e-2431e61a975c', -- Pinacoteca UdeC / Casa del Arte José Clemente Orozco
  '596be6c8-00ef-40fb-99c4-dd7ee069450e', -- Pinacoteca Universidad de Concepción
  '59e1a21a-f7cc-47b6-9c9a-d86a6e000e0c', -- Plataforma Cultural
  '47fda7fb-11e6-4422-acd5-68e55a4efb0a', -- Plataforma Cultural Campus JGM
  'bf48ef2f-fdd7-48ba-97ad-fe173197a47d', -- Plataforma Cultural UCHILE
  'e100c2ca-ecbf-417c-b3f8-409560d8be95', -- Plataforma Cultural [Galería]
  'a7bbfa91-b29c-4420-9703-5fb109983c16', -- Plataforma Cultural, Campus Juan Gómez Millas
  '11bd46b6-01a8-4e47-b5db-ce474c54750b', -- Punta del Lacho (ECIM)
  'e60f1c0c-812e-4f52-866d-70d25eda62fa', -- Sala Abate Molina Centro de Extensión Talca
  '4892ecfd-fbe0-467e-bf26-eea71fceedba', -- Sala Ana Cortés, UMCE
  '79f0c720-3725-4e11-b882-34ab36a20be4', -- Sala Gasco
  '6febadff-eca1-4832-9864-876ab37c5f56', -- Sala Laura Rodig - Museo Gabriela Mistral de Vicuña
  '8d5fe4ab-34ae-4ee6-8686-5a0b105630fa', -- Sala Museo Gabriela Mistral
  '2669c6b8-a43e-4e47-ad90-7f068d99f640', -- Sala Santiago Nattino de APECH
  '1c70c107-bb0d-454a-9234-f3f98e06f452', -- Sala Santiago Nattino – Apech
  'df28b20f-63d1-4c91-ba31-d73ffc846e41', -- Sala de Arte CCU
  'c82622c9-3ed3-49b6-b65c-5aad24af0608', -- Sala de Artes Visuales Usach, Casa Palacio
  'bfed80fd-01b4-4f39-abc6-20383dfd557f', -- Sala de exposiciones - Centro de Extensión y Escuela de Postgrado Santiago, Universidad de Talca
  '8854b1fb-4629-4599-b5da-74a7581865a4', -- Salón Instituto Antártico Chileno INACH
  '6b194446-ecd7-4c70-b3e0-9762efd0dd5c', -- Sitios de Memoria del Estadio Nacional
  '7ffc17b6-d769-4747-98c8-5b062958e629', -- Taller 99
  '0502423f-f521-4ea2-b6bb-eefc33327c51', -- Teatro Regional Cervantes / Museo Maurice van de Maele
  'f103a896-1e91-4a3e-b051-2619a75b5c61', -- UNAB Campus Casona de Las Condes
  '247356f0-916d-47ca-86b7-5ed3eabd98ca', -- UNAB Sede Viña del Mar
  'bb351ce6-86c0-4ff9-a2ff-bfbffa6f9636', -- Universidad Andrés Bello, Campus República
  '5b6061cb-0f5e-4903-a164-cc8f2245803c', -- Universidad de Concepción Campus Los Ángeles
  'c0f325e2-d1f9-464b-a565-0c95793794a2', -- Universidad de Concepción Campus Los Ángeles, Hall de Exposiciones
  'a9832c22-6afd-4bba-85f9-a79e498de73c' -- Vitrina MAPA, GAM
);

-- municipal: 64
update venues set kind = 'municipal' where id in (
  'be71b58e-55f7-47fd-ab9b-ecc9f4fdbeb9', -- Biblioteca Municipal de Puerto Varas
  'fc11329b-2343-4705-b4de-cfb97296cd99', -- Biblioteca Puerto Varas
  '89b08d1a-366d-4ae9-8afa-3d818ace30fc', -- Bodegón Cultural de Los Vilos
  '5ac88872-2a58-4068-ae0d-f1f5e974c8c8', -- Café Arte, Teatro Municipal de San Joaquín
  '37cbfe55-f1b0-48b2-bff3-69349ded23e3', -- Casa Municipal de la Cultura de Iquique
  'adba763a-9d9a-4554-ab0c-d36ec0f6cd2d', -- Casa Pencopolitana
  '7ca26a10-a25e-440a-8e77-74d76b7e9ab2', -- Casa de la Cultura Anselmo Cádiz - Galería de Arte Guillermo Núñez
  'ded55303-da5c-4341-86f3-a220cb2e5d2d', -- Casa de la Cultura Jorge Vigueras Llanos
  '05fc026c-dbbc-4a56-b986-7db0dc00b2a2', -- Casa de la Cultura Puerto Varas
  '55c57e94-ebc5-4109-935d-74ac0480d02e', -- Casa de la Cultura Rancagua
  '42c209ae-765e-4971-a856-08da9eb49f42', -- Casa de la Cultura de Cerro Navia
  '4c7cc231-c727-4706-9345-5be10da1b647', -- Casa de la Cultura de Codegua
  '27b68d2a-13aa-45d5-b478-9681dbdabc6d', -- Casa de la Cultura de Limache
  '1a5d0f61-a5b3-4798-9acc-78b708e66057', -- Casa de la Cultura de Santo Domingo
  'dbdc1c1f-f7ef-4240-95d2-579c0b129e51', -- Centro Cultural Daniel de la Vega
  'd9a8681a-0269-4759-b486-6b714fc84775', -- Centro Cultural El Tranque
  '1b6344e1-a0f4-4430-9381-bfe21a5e3407', -- Centro Cultural Espacio Matta
  '71041ab5-941e-4ae1-ba19-d095d6573b0f', -- Centro Cultural Estación Pueblo Hundido
  '4cb66e5a-d670-4ab6-9b41-c90950fe7c33', -- Centro Cultural Gabriela Mistral
  '4d99f6b4-522e-4cb0-9924-12282763fcdf', -- Centro Cultural Leopoldo Silva Reynoard
  'cf7eb5f9-07b7-469c-ac06-c4941a512633', -- Centro Cultural Mario Oltra Blanco
  'da3d07a4-3410-4cec-9b56-6d11135f2c53', -- Centro Cultural Palace
  '037250ea-ac63-4ded-98e4-1c9c51c8296f', -- Centro Cultural San Joaquín
  'ec587a1a-73f4-414f-b312-ac02931213ef', -- Centro Cultural Teatro Serrano
  '47a49e69-7922-46cb-a2ef-9f75f5231502', -- Centro Cultural de Buin
  '2ace3921-2ebb-4418-83f6-4f54e1298b34', -- Centro Cultural de Lautaro
  '77f7018e-6f51-4864-b432-c5b34281624c', -- Centro Cultural de Los Ángeles
  '92363430-4a7f-431f-8f14-3d100f01636b', -- Centro Cultural de Osorno
  '25797755-ad20-4c70-b572-955eea4e9419', -- Centro Cultural de Puente Alto
  'ac177260-2b5d-474b-8035-977108e78864', -- Centro Cultural de Recoleta
  'c0be5a01-7aa3-4a31-9fc0-f7681343478c', -- Centro de Artes y Oficios Almendral
  'e5c2023d-f201-40ba-ae92-c01f7973c542', -- Colegio Artístico Pedro Montt
  'c6a3bc4b-bfb9-4441-b3ad-ffc928122f8a', -- Colegio Chileno-Árabe, Chiguayante
  'e71943af-7ecf-4ea2-bd25-4ff259d97551', -- Corporación Cultural Estación Central
  '721d65d1-250c-4b22-8805-e5b53810e865', -- Corporación Cultural Municipal de Valdivia
  '6c6b1603-8762-4cb6-b4c1-59b748421261', -- Espacio Cultural La Merced
  '49e46050-57a2-4b9e-999c-34c38cf34aa0', -- Espacio Cultural Viña del Mar
  'b0321f6a-fcb4-4a8c-bd4e-2c3739afe760', -- Espacio Quinta Bella, Centro Cultural de Recoleta
  'c4cd3e94-b2c6-4a59-8e11-d96715c7aca5', -- Galeria Centro Civico Cultural El Bosque
  'e12c2804-b103-4ca9-b76a-1d2a0fc9a25c', -- Galería Centro Cultural
  '369c1f01-1d80-4393-ba22-f5c4919dc4e7', -- Galería Municipal de Arte
  '59375a7f-0734-46cb-bd89-8e24c41d4168', -- Galería Violeta Parra, Teatro Municipal de Chillán
  '4111675b-78d1-4826-b0e0-1c55e6ef0427', -- Galería de Arte, Oficina de Cultura
  'e2677f67-7afd-4d0b-a148-0f4d2b992a05', -- Galería de Arte, Oficina de Cultura San Felipe
  '5551e614-8be5-4d36-bc0b-76ef8fc7a941', -- Hall de la Corporación Cultural de Curicó
  'a461dc03-f868-4bc8-b8f5-0a5dab873887', -- Hall de la Ilustre Municipalidad de Tierra Amarilla
  '7f5f4498-0213-40b3-8565-3354061bb97f', -- La Casona Cultural de Viña del Mar
  '535787c4-0d4d-4236-b07e-912f4c0c82af', -- Liquen, Centro Cultural Municipal de Villarrica
  'e7424538-ef0a-4c79-b08a-6a751e3b3879', -- Mercado Puerto
  'da6babf0-e68a-48f2-aca2-38ab57ec6d40', -- Mercado Puerto / El Farol
  '47d7ac98-411d-442a-9fd3-8fd036366c80', -- Mercado de Chillan
  '966dde54-a84c-47d4-b3ff-281695211fd4', -- Museo Municipal de Constitución
  'a6f5418b-15ec-433f-bede-0ae6a73f11b3', -- Parque Padre Hurtado
  '15bc78dd-fb9a-470f-980d-323f7a056fe4', -- Pucará de Chena
  '08f6e995-835f-4d8d-b16d-cd4f8dba8adf', -- Pérgola Cultural, Plaza de Armas de San Bernardo
  'da148344-1c3e-446b-8cde-507b5b6dd665', -- Sala de Arte Mercado
  '801a6266-f1ce-4738-9c6f-323c4352c052', -- Sala de Exposiciones del Centro Cultural Palace
  '857e2ee7-082e-4399-b8d8-25c1aeb2f0be', -- Sala de exposiciones del Teatro del Club Alemán
  '8df17dbb-4bee-4a66-b4c7-0a3b5ff2f66c', -- Salón Carlos Hollander, Biblioteca Municipal de Coronel
  'c0819b75-6a41-4864-b222-ec83c1ec434c', -- Teatro Municipal de Chillan
  '3d58947d-ad47-4f96-8b61-4cde7f36dc38', -- Teatro Municipal de Coinco
  'd58786aa-484c-4987-90ba-8fab599d57b1', -- Teatro Municipal de Constitución
  'c3e2610f-d44a-4cfa-9423-4694318a63c6', -- Teatro Zapallar
  'b2614fa1-173f-4590-b33c-c0478e8bac3e' -- sala de Exposiciones Sala Veinte, Casa de la Cultura Xaviera Rojas Neira.
);

-- independiente: 93
update venues set kind = 'independiente' where id in (
  'b155b0b2-3f27-49e1-85e7-da69751b8182', -- Anandamapu
  '03d05e68-980f-4615-b828-47a257d95b7c', -- Arrayán Espacio
  'bd719f57-554b-41b6-a1f3-6ec5195a97b5', -- BARCO Galería
  '0e7eaf70-772d-48b2-b8a6-d8578ef84ec1', -- Caja Crisol Espacio Cultural
  '489586d2-8db5-4393-a03b-420e1ac5d6a2', -- Capilla Azul de Contuy Rural
  '3e4678d1-9c17-473b-b927-e4448c88ca07', -- Casa Arte
  'd5fb071b-9e8a-4f92-82d3-dc81aa8ef251', -- Casa Chagual
  'eda32259-61b7-46bd-8765-593fdf56903c', -- Casa Condell (Uprint Fine Art)
  '061151ca-442b-4342-98c5-2d6b31d772d2', -- Casa Cultural Yanulaque
  '424d9f91-287c-4148-b1e8-ffe02be1e1f4', -- Casa Espacio Buenos Aires 824
  'e3b83431-daac-49d6-9f6a-9059ff0f2ca8', -- Casa Foto
  '69263812-7d6c-410d-bf36-8b6572005de0', -- Casa Higuera
  '7f6dd463-0b9e-4323-b55d-8446cef62b9c', -- Casa Líquen
  '8ecc98b5-7b16-43be-a3d9-4adef24552d3', -- Casa Minga
  'dec47bae-568c-4dbb-98f9-392bf6a3272f', -- Casa Portugal
  'ee5420e7-ba42-4fee-8405-16f06c9a2842', -- Casa Varas
  '285da7a7-7ecb-4839-afdc-0d379fcebc17', -- Casa de La Cultura Anáhuac
  '7c67c94e-44f8-41fb-9086-db9c86bf6359', -- Casastudioart.N32
  'b3f235f4-26b6-4853-a05d-9d4b6296ef74', -- Casona Lagos-Lira
  '9e8db5bb-9a64-4380-970f-82912dc0b787', -- Centro Amigos del Arte
  'cee47b05-73e5-4298-8464-97745787fd71', -- Centro Cultural CEINA
  'b7916ccc-bb76-40b5-9b39-e1c08202e42e', -- Centro Cultural Hojalata
  '76cae976-b2fc-4aac-ae80-4fc7803f0733', -- Centro Cultural La Sombrerería
  '46e448bb-8895-4734-9208-5b0a0d64f9bb', -- Centro Cultural Rosa Trauka
  '6160c197-8b43-48b3-aec4-f7ef9d466fc2', -- Centro Cultural Ser Humano
  'fcc07659-2374-4846-a971-61460ba6e2bd', -- Centro de Arte Baños del Almendro (CABA)
  'cf2ee778-56f2-48e2-8652-6ff9f3557e0c', -- Departamento JOTA
  '85ff595e-7524-4bdc-bd90-13a065826ba0', -- Diagonal Pedro Aguirre Cerda
  '085bf024-1a75-4a07-ba89-7176534ca4f0', -- Espacio 218
  'f6c67d16-dd60-4d78-a654-50c6b6f8b700', -- Espacio Arte Ko-Panqui
  '573ba1dc-c9e3-4c61-9aa0-92fc95c129b3', -- Espacio Cultural La Leñera
  '3162725f-868a-44a1-a7dc-53155e0ff712', -- Espacio KOM
  'efa23803-3071-4859-a58c-1a4d83ca0c79', -- Espacio La Cochera
  '659e7b8e-d404-4554-b6ff-09eb091731fa', -- Espacio O
  '3a3a9f67-9617-474b-ad88-f34b8846edc8', -- Espacio Vilches
  '5a50ca51-2352-4b7e-a19e-9f92b9057d34', -- Estación Suralia
  '01657f5f-30c9-47ca-8913-0dac42df5abb', -- Ex Cervecería Ebner
  '39d29884-fb45-4336-8a9e-7ab3f89e567e', -- Fundación Cultural 561
  'ec15b96d-ca3e-4250-acbb-2ed47d4a19d4', -- Fundación Lumbre
  '1d756163-a155-4324-85bd-0d8b3fac75f4', -- Fundación VETA
  'ec571414-ce22-418c-bbdd-a8b6d1c22f4e', -- Fundación VETA Espacio Creativo
  '9300af17-5fc6-4290-9508-6e3191da3322', -- Galeria La Caracola
  '989f1a8c-a0b0-45d4-beae-2b2d58b9dc7c', -- Galería (Merced 633)
  '266bf175-6ceb-428f-ac39-b69b9512b374', -- Galería Al Cubo - Espacio La Compañía
  '1cf1c9b4-492f-4db8-8570-f795c69e5558', -- Galería Bahía Utópica
  'e62d08a6-937c-47cf-ad0d-73953f297d18', -- Galería Biophilia
  '1b9ddc5d-539f-4950-b489-b77196d9e3b5', -- Galería CIMA
  '1145d11d-0c10-4fc2-9db8-46c643582f51', -- Galería Condell
  '741e697c-8804-43b7-a2a1-eeac73e73b1e', -- Galería Cripta
  'd1d43f13-a48e-4338-863f-d52fd6cdf2a4', -- Galería EMIAN
  '91106058-d81e-4bb0-b8f1-1f58bfa998a6', -- Galería Hifas
  '058b30fe-2c57-405e-9fa6-519f70c5c4dd', -- Galería La Fuerza
  'd0a7b206-5ca0-4585-94f9-cd95b05def59', -- Galería MUT
  '177939f2-280e-40e2-a372-5eb125a8c048', -- Galería Malva
  '37178ac4-51d3-4798-9878-1519e72360b2', -- Galería Metropolitana
  '13cf8827-1f87-4445-abfb-9c9d7cbb2710', -- Galería NUGA
  '0939f4ef-e07c-49ec-af93-797cb022012d', -- Galería de Arte Náutico
  'aa6338a5-a2f5-4ab5-9939-a5acc2e1c983', -- Galería de Casa del Arte
  '4ce6bc5d-b7d6-4969-8ae6-72ebb6def4ae', -- Gallery +
  'ab130cbf-e88b-4454-9215-d967a3b68bc6', -- Galpón Independencia
  'e4cd1c00-e3d8-4ebb-bfdb-0464b5dd18f3', -- Hotel Radisson Puerto Varas
  '3e685848-9a54-4483-8e66-b5255d3de970', -- Il Posto
  '3c6116c2-fcdd-4995-95e0-f23584874a4b', -- Instituto Nacional de Ortodoncia
  '4a6a8613-862b-4e33-89d0-ffb104732028', -- Judas Galería
  'ff125f70-6dad-4a19-bb84-51d0073f4139', -- LINIA Galería
  '7922bbe5-050a-46e3-baca-4b1a20ea5a0a', -- La Escala Galería
  'b06af62e-55cc-4bf4-88b2-7a2687210578', -- La Escuela / Residencia Barco
  'e8213147-121c-45d9-9afe-a7b4186d7064', -- La Nube
  '880028ff-301c-44b8-8684-092e21266db0', -- La posada del corregidor
  '3fe6d518-ec31-492f-ae66-8c11788040df', -- Label Fiore (Taller Infante)
  '0ea427a6-535b-426e-a3c5-4dc745c18a37', -- Museo Ciudadano
  '6375b32a-fc3a-48df-94f2-632de4c923f3', -- Museo Internacional Don Armando
  '520ea58d-6da9-4ae8-a253-10ac0802ceea', -- Museo Taller
  '4e07b20d-7584-402d-8bcd-167161a43db9', -- NC 3445
  'a9beee7d-2942-41be-a8e0-51635d202733', -- NIDO Lucía
  'cf25b6a9-c3bb-467f-a5c5-8f411ea4d1c2', -- Nido (edificio Enel, Av. Santa Rosa)
  '37569b9f-d156-4405-b91c-829d4eafc69f', -- Pabellón 83
  '43034ee1-3cfc-49f2-af24-94721fc45169', -- Punto de Cultura Federico Ramírez
  'e54e1f33-74ec-4274-ac7a-ece620d26829', -- Sala Cladonia, LiquenLab
  'b6d2272b-253a-461b-9a84-a2ed1a1463fe', -- Sala El Farol
  'a701f19e-d413-4474-bce5-86e229412e96', -- Sala de Archivos
  'f95cd096-20a5-4b97-a601-9a95356eead4', -- Sala de Obra
  'ae878e57-684d-43c0-8d11-8ee2ef455e5e', -- Salustiano Casanova Galería & Marcos
  'ccc39b64-7349-4cf0-8bb1-f3635a50da64', -- Satélite218
  '565fe3be-f063-46cc-9438-f97aa15af492', -- Sede vecinal Fitz Roy.
  '634003ac-5dd6-48b2-b260-9defed994d32', -- Taller Infante
  '92acb351-4b23-4fe7-b66a-f53d1283ea7a', -- Taller Lautaro
  '06fd5083-bd4f-40aa-8738-138e6c1d9745', -- Taller León
  'd447ac28-453d-400e-b516-da825df7799c', -- Taller Navarrete
  '1a9aca7f-9a93-460f-9031-3837f0031eb6', -- Taller Nube Lab
  '7a3940a7-af45-408d-b11a-88dde46d9b8d', -- Valparaiso Profundo
  '8cefa1bc-b0df-4d40-8e8f-876d48282e01', -- Wall Galería Taller
  '6fd23396-c2b4-4ac0-a14b-675782cd9a27' -- aller Sala Ocre.
);

-- One row per kind (plus 'sin_clasificar'): venues with at least one live
-- event, their live events, and the events opening from 90 days ago
-- onward (upcoming included) — the "recent" slice that shows the trend.
-- security_invoker so venues/events RLS applies; service_role only.
create view venue_kind_share with (security_invoker = true) as
with live as (
  select e.id, e.venue_id, e.opening_datetime
  from events e
  where e.curation_status = 'approved'
    and e.removed_at is null
    and e.venue_id is not null
), per_kind as (
  select
    coalesce(v.kind, 'sin_clasificar') as kind,
    count(distinct v.id) as venues,
    count(l.id) as events,
    count(l.id) filter (where l.opening_datetime >= now() - interval '90 days') as events_90d
  from venues v
  join live l on l.venue_id = v.id
  group by 1
)
select
  kind,
  venues,
  round(100.0 * venues / nullif(sum(venues) over (), 0), 1) as venues_pct,
  events,
  round(100.0 * events / nullif(sum(events) over (), 0), 1) as events_pct,
  events_90d,
  round(100.0 * events_90d / nullif(sum(events_90d) over (), 0), 1) as events_90d_pct
from per_kind;

grant select on venue_kind_share to service_role;
revoke all on venue_kind_share from anon, authenticated;
