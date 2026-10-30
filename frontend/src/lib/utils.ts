export function setPageTitle(title?: string) {
	if (typeof document === 'undefined') return;
	document.title = title ? `${title} - Gnag Home` : 'Gnag Home';
}