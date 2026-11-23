export type PersonProfile = { id: string; name: string; image: string | null };

export function mergePeopleById(previous: PersonProfile[], incoming: PersonProfile[]): PersonProfile[] {
	const peopleById = new Map(previous.map((person) => [person.id, person]));
	for (const person of incoming) peopleById.set(person.id, person);
	return [...peopleById.values()];
}