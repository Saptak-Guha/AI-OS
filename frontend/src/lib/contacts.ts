/**
 * WhatsApp contact book.
 *
 * Lives in localStorage, not the database: these are the user's friends'
 * phone numbers, and nothing about "message Rahul" needs them on a server.
 * The browser resolves the name and sends only the digits to the action API.
 */

const KEY = "aether_contacts";

export type Contact = { name: string; phone: string };

export function contacts(): Contact[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return []; // corrupted entry — an empty book beats a crashed page
  }
}

export function saveContacts(list: Contact[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** Loose match: speech recognition capitalises unpredictably and drops surnames. */
export function findContact(spokenName: string): Contact | undefined {
  const q = spokenName.trim().toLowerCase();
  if (!q) return undefined;
  const list = contacts();
  return (
    list.find((c) => c.name.toLowerCase() === q) ||
    list.find((c) => c.name.toLowerCase().startsWith(q)) ||
    list.find((c) => q.startsWith(c.name.toLowerCase()))
  );
}
