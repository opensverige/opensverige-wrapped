# Ändra årsvideons design

Redigera `frontend/design.js` för scenordning och rubriker. Filmen rymmer upp till tolv granskade berättelser, åtta statistikscener samt öppning och avslutning. Berättelsernas lästid styr längden och hela filmen ryms inom tre minuter. Medlemmen kan läsa manuset och välja bort en berättelse före uppspelning eller export.

`frontend/motion-v3.js` styr typografi, scengrafik och övergångar för alla filmer. React-spelaren visar SVG. Exporten ritar samma former på canvas. PNG-kortet hämtar en stillbild ur filmen.

Filmen använder Midnight Circuit (Variation 1) från ElevenLabs. Ljudspåret i `static/midnight-circuit-v1.m4a` är 120 sekunder långt. `musicSections` i `frontend/design.js` placerar avslutningen sist även i kortare och längre versioner i både spelaren och MP4-filen.

Statistikfilmen använder samma öppningsscen. Introt och varje sifferkort får åtta taktslag. `static/midnight-circuit-stats.m4a` är ett 23,6 sekunder långt utdrag från 0:57 i samma låt. De sista två sekunderna tonar ut. Kortare statistikfilmer börjar längre in i utdraget och får samma avslutning.

Kör `npm ci` och `npm run build` i `frontend` och checka in uppdaterade filer under `static`. Prova länken **Generera mitt år** och ladda ned videon för att kontrollera både bild och ljud.
