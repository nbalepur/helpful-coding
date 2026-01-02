/**
 * Consistent date formatting utility that works the same on server and client
 * to avoid hydration mismatches.
 */

/**
 * Formats a date string to a consistent format that works on both server and client.
 * Uses a fixed format to avoid timezone/locale differences.
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "Unknown date";
  try {
    const date = new Date(dateString);
    // Use UTC methods to ensure consistency between server and client
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthName = monthNames[month];
    
    const hours12 = hours % 12 || 12;
    const ampm = hours >= 12 ? "PM" : "AM";
    const minutesStr = minutes.toString().padStart(2, "0");
    
    return `${monthName} ${day}, ${year}, ${hours12}:${minutesStr} ${ampm}`;
  } catch {
    return dateString;
  }
}

/**
 * Formats a date to show only the date part (no time).
 */
export function formatDateOnly(dateString: string | null | undefined): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthName = monthNames[month];
    
    return `${monthName} ${day}, ${year}`;
  } catch {
    return "";
  }
}

/**
 * Formats today's date in a consistent way.
 * Note: This should only be used in client components to avoid hydration mismatches.
 */
export function formatTodayDate(): string {
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekdayName = weekdayNames[date.getUTCDay()];
  const monthName = monthNames[month];
  
  return `${weekdayName}, ${monthName} ${day}, ${year}`;
}

