export function uniqueEmails(emails: string[]): string[] {
  const result: string[] = [];
  for (const email of emails) {
    if (!result.includes(email.toLowerCase())) {
      result.push(email.toLowerCase());
    }
  }
  return result;
}
