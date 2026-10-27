# Error Handling
Ich habe mich für das never-throw Pattern entschieden.
Damit habe ich durch Elysia + Eden Treaty volle Type-Sicherheit.
Die automatische Typisierung von Elysia funktioniert nicht mit throws.
https://elysiajs.com/essential/handler.html#status
Fehler werden in Elysia mit der `status`-Funktion behandelt.
Bei internen Funktionen nutze ich das `Result`-Pattern, um Fehler zu behandeln und zu propagieren.
Das bedeutet jede Funktion gibt ein `Result` zurück, das entweder einen Wert oder einen Fehler enthält.
Damit ist jedem Aufrufer bekannt, welche Fehler auftreten können und er kann entsprechend darauf reagieren.
Bei asynchronen Funktionen wird das `Result`-Pattern mit `Promise<Result<T, E>>` kombiniert.