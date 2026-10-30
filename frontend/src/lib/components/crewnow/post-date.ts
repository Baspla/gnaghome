const dateFormatter = new Intl.DateTimeFormat('de-DE', {
	dateStyle: 'medium',
	timeStyle: 'short',
	timeZone: 'Europe/Berlin',
});

export function formatPostDate(value: string | null | undefined): { datetime: string; text: string } | null {
	if (!value) return null;
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return null;
	return { datetime: date.toISOString(), text: dateFormatter.format(date) };
}