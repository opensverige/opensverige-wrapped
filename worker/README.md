# Röstinsamling

Kör SQL-migrationen i det delade Supabase-projektet. Den skapar endast Wrapped-objekt med osw_-prefix. Använd en särskild databasroll för workern med USAGE på public och SELECT, INSERT och UPDATE på public.osw_voice_segments. Skapa RLS-policyer för den rollen som tillåter dessa operationer på just denna tabell. Webben använder medlemmens befintliga Supabase-session för läsning via osw_my_voice.

Kör en långlivad process med automatisk omstart. Bygg från repots rot med docker build -f worker/Dockerfile . och injicera DISCORD_BOT_TOKEN samt OSW_DATABASE_URL som hemligheter. Databasadressen ska kräva TLS och använda direktanslutning eller session pooler. Workerprocessen använder ett sessionslås för att undvika dubbelräkning. Den behöver Discord Gateway med guilds och voice states och ansluter aldrig till ljudkanalen. Informera medlemmarna före insamlingsstart.

Verifiera i ett röstrum: anslut, starta och stoppa Go Live, byt rum och lämna. Efter nästa 15-sekunderscheckpoint ska Min rösttid visa två besök och skärmdelning som en del av tiden i första rummet. Nystart och återanslutning börjar ett nytt observationsintervall utan att lägga till besök för redan anslutna medlemmar. En processkrasch kan förlora de senaste obekräftade sekunderna. Import av äldre Statbot-data behöver ett separat verifierat brytdatum.
