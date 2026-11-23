# Ändra årsvideons design

Redigera `frontend/design.js` för färger, typsnitt, scenordning och rubriker. Varje scen får sina värden från medlemmens färdiglästa årsstatistik. Sex scener på tio sekunder ger en minut.

I `frontend/paint.js` styr du layout, konturlinjer och rörelse. Förhandsvisningen och MP4-exporten använder samma ritfunktion. PNG-kortet har en egen layout i `frontend/poster.js`.

Musiken ligger i `static/year-music.m4a`. Byt till ett lika långt AAC-spår i M4A-format vid musikbyte. Anpassa spårets längd om scenlängderna ändras.

Kör `npm ci` och `npm run build` i `frontend` och checka in uppdaterade filer under `static`. Prova länken **Generera mitt år** och ladda ned videon för att kontrollera både bild och ljud.
