# Orbi MVP

Web app / PWA mobile-first para validar Orbi, una red local de logística y movilidad.

## Stack

- Next.js
- React
- Tailwind CSS
- App Router
- Datos simulados
- Solicitudes por WhatsApp

## Instalar

```bash
npm install
```

## Ejecutar en local

```bash
npm run dev
```

Abre `http://localhost:3000`.

## WhatsApp

Por defecto, los formularios abren WhatsApp con el mensaje prellenado sin fijar un número específico.
Para enviar siempre a un número de Orbi, edita `lib/whatsapp.ts` y coloca el número con código de país:

```ts
export const WHATSAPP_NUMBER = "5215500000000";
```

## Pantallas

- `/` Home
- `/pedir` Pedir algo
- `/orbita` Ponerme en órbita
- `/negocios` Negocios afiliados
- `/admin` Panel admin básico
