export { default } from "../page";

// Disable static prerender to avoid CSR bailout issues
export const dynamic = 'force-dynamic';
export const revalidate = 0;

