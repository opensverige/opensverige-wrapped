# Ändra årsvideons design

Redigera `frontend/design.js` för scenordning och rubriker. Filmen rymmer upp till tolv granskade berättelser, fyra statistikscener samt öppning och avslutning. Berättelsernas lästid styr längden och hela filmen ryms inom tre minuter. Medlemmen kan läsa manuset och välja bort en berättelse före uppspelning eller export.

`frontend/motion.js` väljer renderare utifrån filmens sparade tema. Motion V3 använder `frontend/motion-v3.js` för typografi, scengrafik och vertikala övergångar. Original och Puls har sina animationer i `frontend/motion.js`. React-spelaren visar SVG. Exporten ritar samma former på canvas. PNG-kortet hämtar en stillbild ur filmen.

Musiken är ett instrumentalt original från ElevenLabs i `static/year-music.m4a`. Kompositionen är 171 sekunder med en sju sekunder lång avslutning. `musicSections` i `frontend/design.js` placerar avslutningen sist även i kortare och längre versioner i både spelaren och MP4-filen.

Kör `npm ci` och `npm run build` i `frontend` och checka in uppdaterade filer under `static`. Prova länken **Generera mitt år** och ladda ned videon för att kontrollera både bild och ljud.
