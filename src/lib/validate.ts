export const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];

export type CheckoutInput = {
  first: string; last: string; email: string; phone: string;
  company: string; street: string; suburb: string; city: string; province: string; postal: string;
};

const clean = (v: unknown, max = 120) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export function readCheckout(body: Record<string, unknown>): { data: CheckoutInput; errors: string[] } {
  const d: CheckoutInput = {
    first: clean(body.first, 60), last: clean(body.last, 60), email: clean(body.email, 120).toLowerCase(), phone: clean(body.phone, 20),
    company: clean(body.company, 80), street: clean(body.street, 120), suburb: clean(body.suburb, 80), city: clean(body.city, 80),
    province: clean(body.province, 40), postal: clean(body.postal, 10),
  };
  const errors: string[] = [];
  if (!d.first || !d.last) errors.push('Enter your first and last name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errors.push('Enter a valid email address.');
  if (!/^(\+27|0)\d{9}$/.test(d.phone.replace(/[\s-]/g, ''))) errors.push('Enter a South African cellphone number, e.g. 082 123 4567.');
  if (!d.street || !d.suburb || !d.city) errors.push('Enter your street address, suburb and city.');
  if (!PROVINCES.includes(d.province)) errors.push('Choose your province.');
  if (!/^\d{4}$/.test(d.postal)) errors.push('Enter your 4-digit postal code.');
  d.phone = d.phone.replace(/[\s-]/g, '');
  return { data: d, errors };
}
