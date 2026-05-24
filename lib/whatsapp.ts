export const WHATSAPP_NUMBER = "525579950525";

export function buildWhatsAppUrl(message: string) {
  const encodedMessage = encodeURIComponent(message);
  const baseUrl = WHATSAPP_NUMBER
    ? `https://wa.me/${WHATSAPP_NUMBER}`
    : "https://wa.me/";

  return `${baseUrl}?text=${encodedMessage}`;
}
