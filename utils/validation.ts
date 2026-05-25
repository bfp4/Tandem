export function isValidTimeHHMM(value: string | undefined): boolean {
  if (!value) return false;
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [h, m] = value.split(':').map((x) => parseInt(x, 10));
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}
