# Design Assumptions and Restrictions

## Echtzeitkommunikation

Centrifugo-Kanäle bilden ausschließlich Sicherheitsgrenzen ab. Authentifizierte Clients abonnieren statisch `public` und `user:<userId>`; `admin` bleibt für mögliche privilegierte Ereignisse reserviert. Feature-Kanäle, Geräte-Kanäle und globale Präsenz werden nicht verwendet.

`public` enthält ausschließlich Änderungen, die jeder authentifizierte Benutzer kennen darf. Persönliche Einstellungen und private Benachrichtigungen gehen ausschließlich an `user:<userId>`. Jede Nachricht erfüllt den gemeinsamen Vertrag `{ id, occurredAt, type, action, entityId }` mit einem ISO-8601-Zeitstempel; sie enthält weder vollständige Datensätze noch ein `data`-Feld. Die REST-API und Datenbank bleiben die maßgebliche Quelle.

Der GatewayManager validiert eingehende Ereignisse und verteilt sie nach `type`. Ein Verbraucher vergleicht `entityId` zuerst mit den aktuell angezeigten Daten. Bei Übereinstimmung lädt er die einzelne Entität erneut und patcht/entfernt sie oder lädt die passende sichtbare Sammlung/Singleton-Ansicht neu. Nicht passende Ereignisse werden ignoriert. Nach einer Wiederverbindung laden sichtbare Verbraucher den kanonischen API-Zustand erneut.